"use strict";

const Message = require("../models/message.model");
const Conversation = require("../models/conversation.model");
const ConsultationChatSession = require("../models/consultationSession.model");
const conversationService = require("./conversation.service");
const sessionService = require("./consultationSession.service");
const {
    publishUnreadIncrement,
    triggerInAppNotification,
    resolveDisplayName
} = require("./notificationPublisher.service");
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

const POST_CONSULTATION_NOTIFICATION_STATUSES = ["COMPLETED", "DOCTOR_NO_SHOW"];

// ── Part 7: Safety limits ─────────────────────────────────────────────────────
const MAX_MESSAGE_CONTENT_LENGTH = 4000;       // characters
const MAX_FILE_SIZE_BYTES        = 26_214_400; // 25 MB

/**
 * Checks session-level messaging permission for a given sender role.
 */
const checkSessionPermission = (session, senderRole) => {
    const { status } = session;

    if (BLOCKED_STATUSES.includes(status)) {
        return { allowed: false, requiresLimitCheck: false };
    }

    if (status === "ACTIVE") {
        return { allowed: true, requiresLimitCheck: false };
    }

    if (senderRole === "DOCTOR") {
        if (DOCTOR_BLOCKED_STATUSES.includes(status)) {
            return { allowed: false, requiresLimitCheck: false };
        }
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

    return { allowed: false, requiresLimitCheck: false };
};

/**
 * Atomically increments the patient's post-consultation message counter.
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
    if (!consultationId) throw ApiError.badRequest("consultationId is required");
    if (!conversationId) throw ApiError.badRequest("conversationId is required");
    if (!senderId) throw ApiError.badRequest("senderId is required");
    if (!senderRole) throw ApiError.badRequest("senderRole is required");
    
    if (type === "TEXT" && !content) throw ApiError.badRequest("content is required for TEXT messages");
    if (type === "FILE" && !file) throw ApiError.badRequest("file is required for FILE messages");
    if (type === "IMAGE" && !file) throw ApiError.badRequest("file is required for IMAGE messages");

    // ── Part 7: Size guards ──────────────────────────────────────────────
    if (type === "TEXT" && content && content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        throw ApiError.badRequest(`Message content exceeds maximum length of ${MAX_MESSAGE_CONTENT_LENGTH} characters`);
    }
    if (file && file.size && file.size > MAX_FILE_SIZE_BYTES) {
        throw ApiError.badRequest(`File size exceeds maximum allowed size of 25 MB`);
    }

    // ── Part 7: Rate limiting ────────────────
    await checkRateLimit(senderId);

    // ── 1. Idempotency ──────────────────────────
    if (clientMessageId) {
        const existing = await Message.findOne({ conversationId, clientMessageId }).lean();
        if (existing) return existing;
    }

    // ── 2. Validate participant access ──────────────────────────────────
    const conversation = await conversationService.validateParticipantAccess(conversationId, senderId);

    // ── 3. Fetch session and check permissions ──────────────────────────
    const session = await sessionService.getSessionByConsultationId(consultationId);
    const { allowed, requiresLimitCheck } = checkSessionPermission(session, senderRole);

    if (!allowed) {
        throw ApiError.forbidden(`Messaging not allowed in session status: ${session.status} for role: ${senderRole}`);
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
        if (error.code === DUPLICATE_KEY_ERROR_CODE && clientMessageId) {
            const existing = await Message.findOne({ conversationId, clientMessageId }).lean();
            if (existing) return existing;
        }
        throw error;
    }

    // ── 6. Update conversation ───────
    const now = message.createdAt || new Date();
    const preview = buildPreview({ type, content, senderRole, systemEvent: null });

    await Conversation.findByIdAndUpdate(conversationId, {
        $set: {
            lastMessage:         message._id,
            lastMessageAt:       now,
            lastMessagePreview:  preview.lastMessagePreview,
            lastMessageType:     preview.lastMessageType,
            lastSenderRole:      preview.lastSenderRole,
            lastSystemEvent:     null
        }
    });

    logger.info("Message sent", { messageId: message._id, conversationId, consultationId, senderRole });

    const messageObj = message.toObject();

    // ── 7a. Emit session_updated ───
    if (updatedSessionAfterLimit) {
        try {
            const io = getIO();
            const remaining = Math.max(updatedSessionAfterLimit.postMessageLimit - updatedSessionAfterLimit.patientPostMessageCount, 0);
            io.to(conversationId.toString()).emit("session_updated", {
                conversationId: conversationId.toString(),
                consultationId: updatedSessionAfterLimit.consultationId,
                sessionStatus: updatedSessionAfterLimit.status,
                chatEnabled: true,
                messagingLimited: true,
                remainingPatientMessages: remaining
            });
        } catch (emitErr) {
            logger.warn("Failed to emit session_updated", { conversationId, error: emitErr.message });
        }
    }

    // ── 7b. Publish unread increments to all OTHER participants ─────────────
    try {
        const otherParticipants = (conversation.participants || []).filter(p => p.userId !== senderId);
        const shouldSendPostConsultationNotification = POST_CONSULTATION_NOTIFICATION_STATUSES.includes(session.status);
        const senderDisplayName = shouldSendPostConsultationNotification
            ? await resolveDisplayName(senderRole, senderId, senderRole === "DOCTOR" ? "Doctor" : (conversation.patientName || "Patient"))
            : null;

        for (const participant of otherParticipants) {
            publishUnreadIncrement({
                userId:         participant.userId,
                conversationId: message.conversationId,
                unreadCount:    1
            });

            if (shouldSendPostConsultationNotification) {
                const senderLabel = senderRole === "DOCTOR" ? "Doctor" : "Patient";
                const recipientLabel = participant.role === "DOCTOR" ? "doctor" : "patient";
                triggerInAppNotification({
                    userId: participant.userId,
                    title: "Post-Consultation Message",
                    body: `${senderDisplayName || senderLabel} sent a post-consultation message.`,
                    payload: {
                        type: "POST_CONSULTATION_MESSAGE",
                        consultationId,
                        conversationId: message.conversationId.toString(),
                        messageId: message._id.toString(),
                        senderId,
                        senderRole,
                        senderName: senderDisplayName,
                        recipientRole: participant.role,
                        recipientLabel
                    }
                });
            }

            // ── 7c. Emit new_message to recipient's personal room for global toasts ──
            try {
                const io = getIO();
                io.to(`user:${participant.userId}`).emit("new_message", messageObj);
            } catch (socketErr) {
                logger.warn("Failed to emit new_message to personal room", { userId: participant.userId, error: socketErr.message });
            }
        }
    } catch (pubErr) {
        logger.warn("Failed to publish unread increments", { conversationId, error: pubErr.message });
    }

    return messageObj;
};

// ─── Message History ────────────────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 30;
const MAX_PAGE_LIMIT = 100;

const getMessageHistory = async (input) => {
    const { conversationId, consultationId, requesterId, cursor, limit } = input;
    if (!conversationId || !consultationId || !requesterId) throw ApiError.badRequest("Missing required fields");

    await conversationService.validateParticipantAccess(conversationId, requesterId);
    const session = await sessionService.getSessionByConsultationId(consultationId);

    const effectiveLimit = Math.min(Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const filter = { conversationId };

    if (cursor) {
        const cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) throw ApiError.badRequest("Invalid cursor");
        filter.createdAt = { $lt: cursorDate };
    }

    const rows = await Message.find(filter).sort({ createdAt: -1 }).limit(effectiveLimit + 1).lean();
    const hasMore = rows.length > effectiveLimit;
    const messages = hasMore ? rows.slice(0, effectiveLimit) : rows;

    for (const msg of messages) {
        if (msg.deleted) {
            msg.content = null;
            msg.file = null;
        }
    }

    // ── 6. Derive nextCursor ────────────────────────────────────────────
    const lastMessage = messages[messages.length - 1];
    const nextCursor = hasMore && lastMessage ? lastMessage.createdAt.toISOString() : null;

    // ── 7. Calculate remainingPatientMessages ───────────────────────────
    let remainingPatientMessages = null;
    if (PATIENT_LIMITED_STATUSES.includes(session.status)) {
        remainingPatientMessages = Math.max(session.postMessageLimit - session.patientPostMessageCount, 0);
    }

    logger.info("Message history retrieved", {
        conversationId,
        consultationId,
        messageCount: messages.length,
        hasMore,
        cursor: cursor || "initial"
    });

    return { conversationId, messages, session, remainingPatientMessages, nextCursor, hasMore };
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
    if (!conversationId || !query || !requesterId) throw ApiError.badRequest("Missing required fields");

    await conversationService.validateParticipantAccess(conversationId, requesterId);

    const effectiveLimit = Math.min(Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const filter = { conversationId, $text: { $search: query }, deleted: { $ne: true } };

    if (cursor) {
        const cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) throw ApiError.badRequest("Invalid cursor");
        filter.createdAt = { $lt: cursorDate };
    }

    const rows = await Message.find(filter, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" }, createdAt: -1 })
        .limit(effectiveLimit + 1)
        .lean();

    const hasMore = rows.length > effectiveLimit;
    const messages = hasMore ? rows.slice(0, effectiveLimit) : rows;

    for (const msg of messages) {
        msg.snippet = (msg.content || "").slice(0, 200);
    }

    const lastMsg = messages[messages.length - 1];
    const nextCursor = hasMore && lastMsg ? lastMsg.createdAt.toISOString() : null;

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
