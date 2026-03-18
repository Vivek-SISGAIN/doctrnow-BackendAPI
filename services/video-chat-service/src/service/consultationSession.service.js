const ConsultationChatSession = require("../models/consultationSession.model");
const conversationService = require("./conversation.service");
const systemMessageService = require("./systemMessage.service");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

// MongoDB duplicate key error code
const DUPLICATE_KEY_ERROR_CODE = 11000;

// Valid end statuses for session termination
const VALID_END_STATUSES = ["COMPLETED", "PATIENT_NO_SHOW", "DOCTOR_NO_SHOW", "CANCELLED"];

// Post-consultation statuses where patient messaging is limited
const PATIENT_LIMITED_STATUSES = ["COMPLETED", "DOCTOR_NO_SHOW"];

// Terminal statuses that cannot be transitioned from
const TERMINAL_STATUSES = ["COMPLETED", "PATIENT_NO_SHOW", "DOCTOR_NO_SHOW", "CANCELLED"];

/**
 * Creates a chat session for a consultation, or returns the existing one.
 *
 * Idempotent: exactly one session per consultationId.
 *
 * @param {string} consultationId
 * @param {string} conversationId
 * @returns {Promise<Object>} session document (plain object)
 */
const createSessionForConsultation = async (consultationId, conversationId) => {
    if (!consultationId) {
        throw ApiError.badRequest("consultationId is required");
    }
    if (!conversationId) {
        throw ApiError.badRequest("conversationId is required");
    }

    // 1. Check if session already exists
    const existing = await ConsultationChatSession.findOne({ consultationId }).lean();

    if (existing) {
        logger.info("Chat session already exists for consultation", {
            consultationId,
            sessionId: existing._id
        });
        return existing;
    }

    // 2. Attempt to create new session
    try {
        const session = await ConsultationChatSession.create({
            consultationId,
            conversationId,
            status: "NOT_STARTED"
        });

        logger.info("Chat session created for consultation", {
            consultationId,
            sessionId: session._id
        });

        return await ConsultationChatSession.findById(session._id).lean();
    } catch (error) {
        // 3. Handle race condition: concurrent creation
        if (error.code === DUPLICATE_KEY_ERROR_CODE) {
            logger.warn("Duplicate session creation attempted, fetching existing", {
                consultationId
            });

            const existing = await ConsultationChatSession.findOne({ consultationId }).lean();

            if (existing) {
                return existing;
            }
        }

        throw error;
    }
};

/**
 * Activates a chat session — marks it as ACTIVE with a start timestamp.
 *
 * Uses a single conditional atomic update:
 *   - Only transitions NOT_STARTED → ACTIVE.
 *   - If already ACTIVE, returns existing session (idempotent).
 *   - If in any other status, throws error.
 *
 * @param {string} consultationId
 * @returns {Promise<Object>} updated session document (plain object)
 */
const startChatSession = async (consultationId) => {
    // Single atomic update: only transitions NOT_STARTED → ACTIVE
    const updated = await ConsultationChatSession.findOneAndUpdate(
        { consultationId, status: "NOT_STARTED" },
        {
            $set: {
                status: "ACTIVE",
                startedAt: new Date()
            }
        },
        { new: true }
    ).lean();

    if (updated) {
        logger.info("Chat session started", {
            consultationId,
            sessionId: updated._id
        });

        // Fire-and-forget: insert SESSION_STARTED divider.
        // Failure must not propagate — session lifecycle takes priority.
        systemMessageService.insertSystemMessage({
            consultationId,
            conversationId: updated.conversationId,
            consultationSessionId: updated._id,
            systemEvent: "SESSION_STARTED"
        }).catch((err) =>
            logger.warn("Failed to insert SESSION_STARTED system message", {
                consultationId,
                error: err.message
            })
        );

        return updated;
    }

    // Update returned null — either session doesn't exist, or status isn't NOT_STARTED
    const existing = await ConsultationChatSession.findOne({ consultationId }).lean();

    if (!existing) {
        throw ApiError.notFound(
            `Chat session not found for consultation: ${consultationId}`
        );
    }

    // Already active — idempotent return
    if (existing.status === "ACTIVE") {
        logger.info("Chat session already active", {
            consultationId,
            sessionId: existing._id
        });
        return existing;
    }

    // Session is in a terminal state — cannot be started
    throw ApiError.badRequest(
        `Cannot start session with status: ${existing.status}`
    );
};

/**
 * Ends a chat session with the given terminal status.
 *
 * Idempotent: if session is already in a terminal state, returns without modification.
 * If endStatus is CANCELLED and session does not exist, returns null gracefully.
 *
 * Handles post-message limit assignment based on end reason:
 *   - COMPLETED       → uses provided postMessageLimit
 *   - PATIENT_NO_SHOW → forces postMessageLimit to 0
 *   - DOCTOR_NO_SHOW  → uses provided postMessageLimit (or 0)
 *   - CANCELLED       → no messaging allowed
 *
 * @param {string} consultationId
 * @param {string} endStatus - one of COMPLETED, PATIENT_NO_SHOW, DOCTOR_NO_SHOW, CANCELLED
 * @param {number} [postMessageLimit=0] - max patient messages after session ends
 * @returns {Promise<Object|null>} updated session document (plain object), or null for missing cancelled sessions
 */
const endChatSession = async (consultationId, endStatus, postMessageLimit = 0) => {
    if (!VALID_END_STATUSES.includes(endStatus)) {
        throw ApiError.badRequest(
            `Invalid end status: ${endStatus}. Must be one of: ${VALID_END_STATUSES.join(", ")}`
        );
    }

    // Validate postMessageLimit is not negative
    if (typeof postMessageLimit === "number" && postMessageLimit < 0) {
        throw ApiError.badRequest("postMessageLimit cannot be negative");
    }

    const session = await ConsultationChatSession.findOne({ consultationId }).lean();

    if (!session) {
        // CANCELLED without session is valid — consultation was cancelled before session was created
        if (endStatus === "CANCELLED") {
            logger.info("No session to cancel for consultation", { consultationId });
            return null;
        }

        throw ApiError.notFound(
            `Chat session not found for consultation: ${consultationId}`
        );
    }

    // Already in a terminal state — idempotent return
    if (TERMINAL_STATUSES.includes(session.status)) {
        logger.info("Chat session already in terminal state", {
            consultationId,
            sessionId: session._id,
            currentStatus: session.status
        });
        return session;
    }

    // Determine effective post-message limit
    let effectiveLimit = postMessageLimit;

    if (endStatus === "PATIENT_NO_SHOW") {
        effectiveLimit = 0;
    }

    if (endStatus === "CANCELLED") {
        effectiveLimit = 0;
    }

    const updated = await ConsultationChatSession.findOneAndUpdate(
        { _id: session._id, status: { $in: ["NOT_STARTED", "ACTIVE"] } },
        {
            $set: {
                status: endStatus,
                endedAt: new Date(),
                postMessageLimit: effectiveLimit,
                patientPostMessageCount: 0
            }
        },
        { new: true }
    ).lean();

    // Concurrent end — another request terminated it first
    if (!updated) {
        const current = await ConsultationChatSession.findOne({ consultationId }).lean();
        logger.info("Chat session was concurrently terminated", {
            consultationId,
            currentStatus: current?.status
        });
        return current;
    }

    logger.info("Chat session ended", {
        consultationId,
        sessionId: updated._id,
        endStatus,
        postMessageLimit: effectiveLimit
    });

    // Map end-status → system event code
    const END_STATUS_EVENT_MAP = {
        COMPLETED: "CONSULTATION_COMPLETED",
        CANCELLED: "CONSULTATION_CANCELLED",
        PATIENT_NO_SHOW: "PATIENT_NO_SHOW",
        DOCTOR_NO_SHOW: "DOCTOR_NO_SHOW"
    };

    const systemEvent = END_STATUS_EVENT_MAP[endStatus];

    if (systemEvent) {
        // Fire-and-forget: insert end-of-session divider.
        // Failure must not propagate — session lifecycle takes priority.
        systemMessageService.insertSystemMessage({
            consultationId,
            conversationId: updated.conversationId,
            consultationSessionId: updated._id,
            systemEvent
        }).catch((err) =>
            logger.warn("Failed to insert end-session system message", {
                consultationId,
                systemEvent,
                error: err.message
            })
        );
    }

    return updated;
};

/**
 * Fetches session by consultationId.
 * Throws 404 if not found.
 *
 * @param {string} consultationId
 * @returns {Promise<Object>} session document (plain object)
 */
const getSessionByConsultationId = async (consultationId) => {
    const session = await ConsultationChatSession.findOne({ consultationId }).lean();

    if (!session) {
        throw ApiError.notFound(
            `Chat session not found for consultation: ${consultationId}`
        );
    }

    return session;
};

/**
 * Returns session info with role-aware permissions for the frontend.
 *
 * Computes:
 *   - chatEnabled:    can this user send a message right now?
 *   - canViewChat:    can this user view chat history?
 *   - messagingLimited: is the patient under a post-consultation cap?
 *   - remainingPatientMessages: how many patient messages remain (null if not limited)
 *
 * Read-only — no database mutations.
 *
 * @param {Object}  input
 * @param {string}  input.consultationId
 * @param {string}  input.requesterId
 * @param {string}  input.requesterRole - "DOCTOR" | "PATIENT"
 * @returns {Promise<Object>} session info payload
 */
const getSessionInfo = async ({ consultationId, requesterId, requesterRole }) => {
    // ── 0. Input validation ──────────────────────────────────────────────
    if (!consultationId) {
        throw ApiError.badRequest("consultationId is required");
    }
    if (!requesterId) {
        throw ApiError.badRequest("requesterId is required");
    }
    if (!["DOCTOR", "PATIENT"].includes(requesterRole)) {
        throw ApiError.badRequest(
            "requesterRole must be DOCTOR or PATIENT"
        );
    }

    // ── 1. Fetch session ─────────────────────────────────────────────────
    const session = await ConsultationChatSession.findOne({ consultationId }).lean();

    if (!session) {
        throw ApiError.notFound(
            `Chat session not found for consultation: ${consultationId}`
        );
    }

    // ── 2. Access control ────────────────────────────────────────────────
    await conversationService.validateParticipantAccess(
        session.conversationId,
        requesterId
    );

    // ── 3. Remaining patient messages ────────────────────────────────────
    let remainingPatientMessages = null;

    if (PATIENT_LIMITED_STATUSES.includes(session.status)) {
        remainingPatientMessages = Math.max(
            session.postMessageLimit - session.patientPostMessageCount,
            0
        );
    }

    // ── 4. messagingLimited (patient-only) ───────────────────────────────
    const messagingLimited =
        requesterRole === "PATIENT" &&
        PATIENT_LIMITED_STATUSES.includes(session.status);

    // ── 5. chatEnabled (role-aware) ──────────────────────────────────────
    let chatEnabled = false;

    if (session.status === "ACTIVE") {
        // Both roles can send freely during an active session
        chatEnabled = true;
    } else if (requesterRole === "DOCTOR") {
        // Doctor can only send post-consultation when status is COMPLETED
        chatEnabled = session.status === "COMPLETED";
    } else if (requesterRole === "PATIENT") {
        // Patient can send only if in a limited status AND has remaining quota
        chatEnabled =
            PATIENT_LIMITED_STATUSES.includes(session.status) &&
            remainingPatientMessages > 0;
    }

    // ── 6. canViewChat ───────────────────────────────────────────────────
    // Session exists and requester is a valid participant — history is viewable
    const canViewChat = !["CANCELLED", "NOT_STARTED"].includes(session.status);

    logger.info("Session info retrieved", {
        consultationId,
        requesterId,
        requesterRole,
        sessionStatus: session.status,
        chatEnabled,
        canViewChat,
        messagingLimited,
        remainingPatientMessages
    });

    return {
        conversationId: session.conversationId,
        sessionStatus: session.status,
        chatEnabled,
        canViewChat,
        messagingLimited,
        remainingPatientMessages,
        startedAt: session.startedAt || null,
        endedAt: session.endedAt || null
    };
};

module.exports = {
    createSessionForConsultation,
    startChatSession,
    endChatSession,
    getSessionByConsultationId,
    getSessionInfo
};
