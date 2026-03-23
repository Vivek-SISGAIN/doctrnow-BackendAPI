"use strict";

const Message = require("../models/message.model");
const Conversation = require("../models/conversation.model");
const ConsultationChatSession = require("../models/consultationSession.model");
const conversationService = require("./conversation.service");
const sessionService = require("./consultationSession.service");
const { publishUnreadIncrement } = require("./notificationPublisher.service");
const { buildPreview } = require("../utils/previewBuilder");
const { checkRateLimit } = require("../utils/rateLimiter");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { getIO } = require("../realtime/socket");

// MongoDB duplicate key error code
const DUPLICATE_KEY_ERROR_CODE = 11000;

// Statuses where no one can send messages
const BLOCKED_STATUSES = ["NOT_STARTED", "CANCELLED"];

// Statuses where patient post-consultation limit applies
const PATIENT_LIMITED_STATUSES = ["COMPLETED", "DOCTOR_NO_SHOW"];

// Statuses where patient is fully blocked
const PATIENT_BLOCKED_STATUSES = ["PATIENT_NO_SHOW"];

// Statuses where doctor is fully blocked
const DOCTOR_BLOCKED_STATUSES = ["DOCTOR_NO_SHOW", "PATIENT_NO_SHOW"];

// ── Part 7: Safety limits ─────────────────────────────────────────────────────
const MAX_MESSAGE_CONTENT_LENGTH = 4000;       // characters
const MAX_FILE_SIZE_BYTES        = 26_214_400; // 25 MB

/**
 * Checks session-level messaging permission for a given sender role.
 *
 * Rules:
 *   NOT_STARTED / CANCELLED  → no one can send
 *   ACTIVE                   → unlimited for both roles
 *   COMPLETED                → doctor unlimited, patient limited
 *   PATIENT_NO_SHOW          → doctor blocked, patient blocked
 *   DOCTOR_NO_SHOW           → doctor blocked, patient limited
 *
 * @param {Object} session  - ConsultationChatSession document (plain object)
 * @param {string} senderRole - "DOCTOR" | "PATIENT"
 * @returns {{ allowed: boolean, requiresLimitCheck: boolean }}
 */
const checkSessionPermission = (session, senderRole) => {
    const { status } = session;

    // Universally blocked statuses
    if (BLOCKED_STATUSES.includes(status)) {
        return { allowed: false, requiresLimitCheck: false };
    }

    // ACTIVE — everyone sends freely
    if (status === "ACTIVE") {
        return { allowed: true, requiresLimitCheck: false };
    }

    // Role-specific checks for terminal statuses
    if (senderRole === "DOCTOR") {
        if (DOCTOR_BLOCKED_STATUSES.includes(status)) {
            return { allowed: false, requiresLimitCheck: false };
        }
        // COMPLETED, PATIENT_NO_SHOW — doctor can send unlimited
        return { allowed: true, requiresLimitCheck: false };
    }

    if (senderRole === "PATIENT") {
        if (PATIENT_BLOCKED_STATUSES.includes(status)) {
            return { allowed: false, requiresLimitCheck: false };
        }
        if (PATIENT_LIMITED_STATUSES.includes(status)) {
            return { allowed: true, requiresLimitCheck: true };
        }
    }

    // Fallback — deny by default (defensive)
    return { allowed: false, requiresLimitCheck: false };
};

/**
 * Atomically increments the patient's post-consultation message counter.
 *
 * Uses a conditional update with $lt guard to prevent exceeding the limit.
 * If the update returns null, the patient has exhausted their allowed messages.
 *
 * @param {string} consultationId
 * @returns {Promise<Object>} updated session document
 * @throws {ApiError} 403 if post-chat limit is exceeded
 */
const incrementPatientPostMessageCount = async (consultationId) => {
    const updated = await ConsultationChatSession.findOneAndUpdate(
        {
            consultationId,
            status: { $in: PATIENT_LIMITED_STATUSES },
            $expr: { $lt: ["$patientPostMessageCount", "$postMessageLimit"] }
        },
        { $inc: { patientPostMessageCount: 1 } },
        { new: true }
    ).lean();

    if (!updated) {
        throw ApiError.forbidden(
            "Post-consultation message limit exceeded"
        );
    }

    logger.info("Patient post-message count incremented", {
        consultationId,
        patientPostMessageCount: updated.patientPostMessageCount,
        postMessageLimit: updated.postMessageLimit
    });

    return updated;
};

/**
 * Sends a message within a consultation chat session.
 *
 * Full lifecycle:
 *   1. Input validation (size guards, type checks)
 *   2. Rate limit check (sliding window, Redis)
 *   3. Idempotency — early duplicate check via clientMessageId
 *   4. Validate participant access
 *   5. Fetch session and enforce status-based permissions
 *   6. Enforce atomic patient post-consultation limit (if applicable)
 *   7. Persist message document
 *   8. Update conversation lastMessage + denormalised preview fields
 *   9. Publish unread increment to all participants except sender (fire-and-forget)
 *
 * @param {Object} input
 * @param {string} input.consultationId
 * @param {string} input.conversationId
 * @param {string} input.senderId
 * @param {string} input.senderRole   - "DOCTOR" | "PATIENT"
 * @param {string} [input.type="TEXT"] - "TEXT" | "IMAGE" | "FILE"
 * @param {string} [input.content]
 * @param {Object} [input.file]
 * @param {string} [input.clientMessageId]
 * @returns {Promise<Object>} saved message document (plain object)
 */
const sendMessage = async (input) => {
    const {
        consultationId,
        conversationId,
        senderId,
        senderRole,
        type = "TEXT",
        content,
        file,
        clientMessageId
    } = input;

    // ── 0. Input validation ──────────────────────────────────────────────
    if (!consultationId) {
        throw ApiError.badRequest("consultationId is required");
    }
    if (!conversationId) {
        throw ApiError.badRequest("conversationId is required");
    }
    if (!senderId) {
        throw ApiError.badRequest("senderId is required");
    }
    if (!senderRole) {
        throw ApiError.badRequest("senderRole is required");
    }
    if (!["DOCTOR", "PATIENT"].includes(senderRole)) {
        throw ApiError.badRequest(
            "senderRole must be DOCTOR or PATIENT for user-generated messages"
        );
    }
    if (type === "TEXT" && !content) {
        throw ApiError.badRequest("content is required for TEXT messages");
    }
    if (type === "FILE" && !file) {
        throw ApiError.badRequest("file is required for FILE messages");
    }
    if (type === "IMAGE" && !file) {
        throw ApiError.badRequest("file is required for IMAGE messages");
    }

    // ── Part 7: Size guards ──────────────────────────────────────────────
    if (type === "TEXT" && content && content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        throw ApiError.badRequest(
            `Message content exceeds maximum length of ${MAX_MESSAGE_CONTENT_LENGTH} characters`
        );
    }
    if (file && file.size && file.size > MAX_FILE_SIZE_BYTES) {
        throw ApiError.badRequest(
            `File size exceeds maximum allowed size of 25 MB`
        );
    }

    // ── Part 7: Rate limiting (sliding window per userId) ────────────────
    await checkRateLimit(senderId);

    // ── 1. Idempotency — early duplicate check ──────────────────────────
    // Check before any side-effects (like incrementing the post-message counter)
    if (clientMessageId) {
        const existing = await Message.findOne({
            conversationId,
            clientMessageId
        }).lean();

        if (existing) {
            logger.info("Duplicate message detected via clientMessageId", {
                clientMessageId,
                messageId: existing._id
            });
            return existing;
        }
    }

    // ── 2. Validate participant access ──────────────────────────────────
    const conversation = await conversationService.validateParticipantAccess(conversationId, senderId);

    // ── 3. Fetch session and check permissions ──────────────────────────
    const session = await sessionService.getSessionByConsultationId(consultationId);

    const { allowed, requiresLimitCheck } = checkSessionPermission(session, senderRole);

    if (!allowed) {
        throw ApiError.forbidden(
            `Messaging not allowed in session status: ${session.status} for role: ${senderRole}`
        );
    }

    // ── 4. Atomic patient post-consultation limit ───────────────────────
    let updatedSessionAfterLimit = null;
    if (requiresLimitCheck) {
        updatedSessionAfterLimit = await incrementPatientPostMessageCount(consultationId);
    }

    // ── 5. Persist message ──────────────────────────────────────────────
    let message;

    try {
        message = await Message.create({
            conversationId,
            consultationId,
            consultationSessionId: session._id,
            senderId,
            senderRole,
            type,
            content,
            file,
            status: "SENT",
            clientMessageId: clientMessageId || undefined
        });
    } catch (error) {
        // Race condition: another request inserted with the same clientMessageId
        // between our check (step 1) and insert
        if (error.code === DUPLICATE_KEY_ERROR_CODE && clientMessageId) {
            logger.warn("Concurrent duplicate message insert detected", {
                clientMessageId,
                conversationId
            });

            const existing = await Message.findOne({
                conversationId,
                clientMessageId
            }).lean();

            if (existing) {
                return existing;
            }
        }

        throw error;
    }

    // ── 6. Update conversation: lastMessage + denormalised preview ───────
    const now = message.createdAt || new Date();
    const preview = buildPreview({ type, content, senderRole, systemEvent: null });

    await Conversation.findByIdAndUpdate(conversationId, {
        $set: {
            lastMessage:         message._id,
            lastMessageAt:       now,
            lastMessagePreview:  preview.lastMessagePreview,
            lastMessageType:     preview.lastMessageType,
            lastSenderRole:      preview.lastSenderRole,
            lastSystemEvent:     null   // clear any previous system event
        }
    });

    logger.info("Message sent", {
        messageId: message._id,
        conversationId,
        consultationId,
        senderRole,
        type
    });

    const messageObj = message.toObject();

    // ── 7a. Emit session_updated so patient's remaining count updates in real time ───
    // Only relevant when patient just sent a post-consultation message.
    if (updatedSessionAfterLimit) {
        try {
            const io = getIO();
            const remaining = Math.max(
                updatedSessionAfterLimit.postMessageLimit - updatedSessionAfterLimit.patientPostMessageCount,
                0
            );
            io.to(conversationId.toString()).emit("session_updated", {
                conversationId: conversationId.toString(),
                consultationId: updatedSessionAfterLimit.consultationId,
                sessionStatus: updatedSessionAfterLimit.status,
                // Shared room event: keep doctor able to send even when the
                // patient's post-consultation quota reaches zero.
                chatEnabled: true,
                messagingLimited: true,
                remainingPatientMessages: remaining
            });
        } catch (emitErr) {
            // Non-blocking — socket failure must not break message send
            logger.warn("Failed to emit session_updated after patient message", {
                conversationId,
                error: emitErr.message
            });
        }
    }

    // ── 7b. Publish unread increments to all OTHER participants ─────────────
    // Fire-and-forget — uses the full conversation doc gained from access check
    try {
        const otherParticipants = (conversation.participants || []).filter(
            (p) => p.userId !== senderId
        );

        for (const participant of otherParticipants) {
            publishUnreadIncrement({
                userId:         participant.userId,
                conversationId: message.conversationId,
                unreadCount:    1   // approximate; frontend can re-fetch for exact count
            });
        }
    } catch (pubErr) {
        logger.warn("Failed to publish unread increments", {
            conversationId,
            error: pubErr.message
        });
    }

    return messageObj;
};

// ─── Message History ────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 30;
const MAX_PAGE_LIMIT = 100;

/**
 * Retrieves paginated message history for a conversation.
 *
 * Pagination strategy:
 *   - Cursor-based using createdAt (ISO string).
 *   - Fetches limit + 1 rows; the extra row is used solely to derive
 *     `hasMore` without issuing a separate count query.
 *   - Messages are returned newest-first (createdAt DESC), which matches
 *     the compound index { conversationId: 1, createdAt: -1 }.
 *
 * Deleted messages are kept in the result set (preserves timeline
 * continuity and pagination cursor stability), but their content and
 * file fields are nulled out so no sensitive data leaks to the client.
 *
 * @param {Object}  input
 * @param {string}  input.conversationId  - primary fetch key
 * @param {string}  input.consultationId  - used to fetch session metadata
 * @param {string}  input.requesterId     - userId for access validation
 * @param {string}  [input.cursor]        - ISO date string (createdAt of last message on previous page)
 * @param {number}  [input.limit=30]      - page size, capped at 100
 * @returns {Promise<Object>} { conversationId, messages, session, remainingPatientMessages, nextCursor, hasMore }
 */
const getMessageHistory = async (input) => {
    const {
        conversationId,
        consultationId,
        requesterId,
        cursor,
        limit
    } = input;

    // ── 0. Input validation ──────────────────────────────────────────────
    if (!conversationId) {
        throw ApiError.badRequest("conversationId is required");
    }
    if (!consultationId) {
        throw ApiError.badRequest("consultationId is required");
    }
    if (!requesterId) {
        throw ApiError.badRequest("requesterId is required");
    }

    // ── 1. Access control ────────────────────────────────────────────────
    await conversationService.validateParticipantAccess(conversationId, requesterId);

    // ── 2. Fetch session metadata ────────────────────────────────────────
    const session = await sessionService.getSessionByConsultationId(consultationId);

    // ── 3. Build query ──────────────────────────────────────────────────
    const effectiveLimit = Math.min(
        Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_PAGE_LIMIT,
        MAX_PAGE_LIMIT
    );

    const filter = { conversationId };

    if (cursor) {
        const cursorDate = new Date(cursor);

        if (isNaN(cursorDate.getTime())) {
            throw ApiError.badRequest("cursor must be a valid ISO date string");
        }

        filter.createdAt = { $lt: cursorDate };
    }

    // ── 4. Execute query ────────────────────────────────────────────────
    // Fetch one extra document to determine whether more pages exist.
    const rows = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(effectiveLimit + 1)
        .lean();

    const hasMore = rows.length > effectiveLimit;

    // Trim the extra probe row if present
    const messages = hasMore ? rows.slice(0, effectiveLimit) : rows;

    // ── 5. Sanitize deleted messages ────────────────────────────────────
    for (const msg of messages) {
        if (msg.deleted) {
            msg.content = null;
            msg.file = null;
        }
    }

    // ── 6. Derive nextCursor ────────────────────────────────────────────
    const lastMessage = messages[messages.length - 1];
    const nextCursor = hasMore && lastMessage
        ? lastMessage.createdAt.toISOString()
        : null;

    // ── 7. Calculate remainingPatientMessages ───────────────────────────
    let remainingPatientMessages = null;

    if (PATIENT_LIMITED_STATUSES.includes(session.status)) {
        remainingPatientMessages = Math.max(
            session.postMessageLimit - session.patientPostMessageCount,
            0
        );
    }

    logger.info("Message history retrieved", {
        conversationId,
        consultationId,
        messageCount: messages.length,
        hasMore,
        cursor: cursor || "initial"
    });

    return {
        conversationId,
        messages,
        session,
        remainingPatientMessages,
        nextCursor,
        hasMore
    };
};

// ─── Message Search (Part 5) ─────────────────────────────────────────────────

const MAX_SEARCH_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;

/**
 * Full-text search within a conversation using MongoDB text index.
 *
 * Rules:
 *   - Only non-deleted messages are returned.
 *   - Cursor-based pagination using createdAt DESC.
 *   - Limit is capped at 50.
 *   - Returns a `snippet` field (the content itself, trimmed to 200 chars).
 *
 * @param {Object} input
 * @param {string} input.conversationId
 * @param {string} input.query
 * @param {string} input.requesterId    - for access validation
 * @param {string} [input.cursor]       - ISO date string
 * @param {number} [input.limit]
 * @returns {Promise<{ messages: Object[], nextCursor: string|null, hasMore: boolean }>}
 */
const searchMessages = async ({ conversationId, query, requesterId, cursor, limit }) => {
    if (!conversationId) {
        throw ApiError.badRequest("conversationId is required");
    }
    if (!query || query.trim().length === 0) {
        throw ApiError.badRequest("query is required");
    }
    if (!requesterId) {
        throw ApiError.badRequest("requesterId is required");
    }

    // Access control
    await conversationService.validateParticipantAccess(conversationId, requesterId);

    const effectiveLimit = Math.min(
        Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT,
        MAX_SEARCH_LIMIT
    );

    const filter = {
        conversationId,
        $text: { $search: query },
        deleted: { $ne: true }
    };

    if (cursor) {
        const cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) {
            throw ApiError.badRequest("cursor must be a valid ISO date string");
        }
        filter.createdAt = { $lt: cursorDate };
    }

    const rows = await Message.find(filter, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" }, createdAt: -1 })
        .limit(effectiveLimit + 1)
        .lean();

    const hasMore = rows.length > effectiveLimit;
    const messages = hasMore ? rows.slice(0, effectiveLimit) : rows;

    // Attach snippet (matched content trimmed to 200 chars)
    for (const msg of messages) {
        msg.snippet = (msg.content || "").slice(0, 200);
    }

    const lastMsg = messages[messages.length - 1];
    const nextCursor = hasMore && lastMsg
        ? lastMsg.createdAt.toISOString()
        : null;

    logger.info("Message search executed", {
        conversationId,
        query,
        resultCount: messages.length,
        hasMore
    });

    return { messages, nextCursor, hasMore };
};

module.exports = {
    sendMessage,
    getMessageHistory,
    searchMessages
};
