"use strict";

const messageService = require("../service/message.service");
const sessionService = require("../service/consultationSession.service");
const conversationService = require("../service/conversation.service");
const inboxService = require("../service/conversationInbox.service");
const conversationStateService = require("../service/conversationState.service");
const { getIO } = require("../realtime/socket");
const logger = require("../utils/logger");

// ─── Send Message ────────────────────────────────────────────────────────────

/**
 * POST /api/chat/messages
 *
 * Creates a message via the REST path, then fans it out to the
 * socket room for realtime delivery.
 *
 * The socket fan-out is non-blocking: a socket failure never causes
 * the REST response to fail.
 */
const sendMessage = async (req, res, next) => {
    try {
        const { userId, role } = req.user;
        const {
            consultationId,
            conversationId,
            type,
            content,
            file,
            clientMessageId
        } = req.body;

        const message = await messageService.sendMessage({
            consultationId,
            conversationId,
            senderId: userId,
            senderRole: role,
            type,
            content,
            file,
            clientMessageId
        });

        // Non-blocking socket fan-out — failure must never break the REST response
        try {
            getIO().to(message.conversationId.toString()).emit("new_message", message);
        } catch (err) {
            logger.warn("Socket fan-out failed for user message", {
                conversationId: message.conversationId,
                error: err.message
            });
        }

        res.status(201).json({ success: true, data: message });
    } catch (err) {
        next(err);
    }
};

// ─── Get Message History ─────────────────────────────────────────────────────

/**
 * GET /api/chat/messages
 *
 * Cursor-based paginated message history.
 * Query params: conversationId, consultationId, cursor (ISO date), limit
 */
const getMessages = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const { conversationId, consultationId, cursor, limit } = req.query;

        const result = await messageService.getMessageHistory({
            conversationId,
            consultationId,
            requesterId: userId,
            cursor,
            limit: limit ? parseInt(limit, 10) : undefined
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

// ─── Message Search (Part 5) ──────────────────────────────────────────────────

/**
 * GET /api/chat/messages/search
 *
 * Full-text search within a conversation.
 * Query params: conversationId, query, cursor (ISO date), limit
 */
const searchMessages = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const { conversationId, query, cursor, limit } = req.query;

        const result = await messageService.searchMessages({
            conversationId,
            query,
            requesterId: userId,
            cursor,
            limit: limit ? parseInt(limit, 10) : undefined
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

// ─── Session Info ─────────────────────────────────────────────────────────────

/**
 * GET /api/chat/session-info
 *
 * Returns role-aware session info: chatEnabled, messagingLimited,
 * remainingPatientMessages, startedAt, endedAt, conversationId.
 */
const getSessionInfo = async (req, res, next) => {
    try {
        const { userId, role } = req.user;
        const { consultationId } = req.query;

        const info = await sessionService.getSessionInfo({
            consultationId,
            requesterId: userId,
            requesterRole: role
        });

        res.status(200).json({ success: true, data: info });
    } catch (err) {
        next(err);
    }
};

// ─── Session Lifecycle ────────────────────────────────────────────────────────

/**
 * POST /api/chat/session/create
 *
 * Creates (or returns existing) chat session for a consultation.
 * Idempotent.
 */
const createSession = async (req, res, next) => {
    try {
        const { consultationId, conversationId, patientId, doctorId, patientName, patientAvatar } = req.body;
        const session = await sessionService.createSessionForConsultation(
            consultationId,
            conversationId,
            patientId,
            doctorId,
            patientName,
            patientAvatar
        );
        res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/chat/session/start
 *
 * Transitions session from NOT_STARTED → ACTIVE. Idempotent.
 */
const startSession = async (req, res, next) => {
    try {
        const { consultationId } = req.body;
        const session = await sessionService.startChatSession(consultationId);
        res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/chat/session/end
 *
 * Transitions session to a terminal status and records postMessageLimit.
 */
const endSession = async (req, res, next) => {
    try {
        const { consultationId, endStatus, postMessageLimit } = req.body;
        const session = await sessionService.endChatSession(consultationId, endStatus, postMessageLimit);
        res.status(200).json({ success: true, data: session });
    } catch (err) {
        next(err);
    }
};

// ─── Mark Conversation Read ───────────────────────────────────────────────────

/**
 * POST /api/chat/conversations/:id/read
 *
 * Atomically marks the conversation as read for the calling user and
 * broadcasts inbox_update to their other connected devices.
 */
const markConversationRead = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const conversationId = req.params.id;

        const result = await inboxService.markConversationRead({ conversationId, userId });

        // Non-blocking cross-device sync (Part 8)
        try {
            getIO()
                .to(`user:${userId}`)
                .emit("inbox_update", {
                    type: "read",
                    conversationId,
                    readAt: result.readAt.toISOString(),
                    unreadCount: 0
                });
        } catch (socketErr) {
            logger.warn("inbox_update socket emit failed (read)", {
                userId,
                conversationId,
                error: socketErr.message
            });
        }

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

// ─── Get Conversation Inbox ───────────────────────────────────────────────────

/**
 * GET /api/chat/conversations
 *
 * Returns the paginated conversation inbox for the calling user.
 * Query params: limit, cursor (ISO-8601), includeArchived (boolean)
 */
const getConversationInbox = async (req, res, next) => {
    try {
        const { userId, role } = req.user;
        const { limit, cursor, includeArchived } = req.query;

        const result = await inboxService.getConversationInbox({
            userId,
            role,
            limit: limit ? parseInt(limit, 10) : undefined,
            cursor: cursor || null,
            includeArchived: includeArchived === "true"
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

// ─── Conversation State Actions (Part 4) ─────────────────────────────────────

/**
 * Shared helper: calls a state service function, emits inbox_update,
 * and returns 200 JSON.
 *
 * @param {Function} serviceFn
 * @param {string}   eventType  - label for inbox_update.type
 * @param {object}   req
 * @param {object}   res
 * @param {Function} next
 */
const handleStateAction = async (serviceFn, eventType, req, res, next) => {
    try {
        const { userId } = req.user;
        const conversationId = req.params.id;

        await serviceFn({ conversationId, userId });

        // Part 8: emit inbox_update to user's personal room — non-blocking
        try {
            getIO()
                .to(`user:${userId}`)
                .emit("inbox_update", {
                    type: eventType,
                    conversationId
                });
        } catch (socketErr) {
            logger.warn(`inbox_update socket emit failed (${eventType})`, {
                userId,
                conversationId,
                error: socketErr.message
            });
        }

        res.status(200).json({ success: true, data: { conversationId, action: eventType } });
    } catch (err) {
        next(err);
    }
};

/** POST /api/chat/conversations/:id/mute */
const muteConversation = (req, res, next) =>
    handleStateAction(conversationStateService.muteConversation, "muted", req, res, next);

/** POST /api/chat/conversations/:id/unmute */
const unmuteConversation = (req, res, next) =>
    handleStateAction(conversationStateService.unmuteConversation, "unmuted", req, res, next);

/** POST /api/chat/conversations/:id/archive */
const archiveConversation = (req, res, next) =>
    handleStateAction(conversationStateService.archiveConversation, "archived", req, res, next);

/** POST /api/chat/conversations/:id/unarchive */
const unarchiveConversation = (req, res, next) =>
    handleStateAction(conversationStateService.unarchiveConversation, "unarchived", req, res, next);

/** POST /api/chat/conversations/:id/pin */
const pinConversation = (req, res, next) =>
    handleStateAction(conversationStateService.pinConversation, "pinned", req, res, next);

/** POST /api/chat/conversations/:id/unpin */
const unpinConversation = (req, res, next) =>
    handleStateAction(conversationStateService.unpinConversation, "unpinned", req, res, next);

/**
 * POST /api/chat/session/update-participant
 *
 * Internal endpoint for consultation-service to update participant userId.
 */
const updateParticipant = async (req, res, next) => {
    try {
        const { consultationId, oldUserId, newUserId } = req.body;
        await conversationService.updateParticipantUserId(consultationId, oldUserId, newUserId);
        res.status(200).json({ success: true });
    } catch (err) {
        next(err);
    }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    sendMessage,
    getMessages,
    searchMessages,
    getSessionInfo,
    createSession,
    startSession,
    endSession,
    markConversationRead,
    getConversationInbox,
    muteConversation,
    unmuteConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation,
    updateParticipant
};
