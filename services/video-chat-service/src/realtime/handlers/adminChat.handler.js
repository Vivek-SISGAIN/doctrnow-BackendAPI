"use strict";

/**
 * Admin Chat Socket Handler
 * ──────────────────────────
 * Manages the Socket.IO layer for the Hospital Admin ↔ Super Admin
 * support-chat flow.
 *
 * Rooms:
 *   "admin_support"          — all connected Super Admins join this room
 *                              so new requests are broadcast to every SA
 *   "admin_session:<id>"     — both participants of an ACTIVE session join
 *                              this room to exchange real-time messages
 *
 * Events emitted TO clients:
 *   admin_chat:new_request   — a new support request has been raised
 *   admin_chat:accepted      — a super admin accepted the request
 *   admin_chat:ended         — the session was closed
 *   admin_chat:message       — a chat message within an active session
 *   admin_chat:typing        — typing indicator within a session
 *
 * Events received FROM clients:
 *   admin_chat:join_support  — super admin opts in to receive request broadcasts
 *   admin_chat:join_session  — join a specific active-session room
 *   admin_chat:leave_session — leave a session room
 *   admin_chat:message       — send a message in an active session
 *   admin_chat:typing        — broadcast typing indicator to the other party
 */

const logger = require("../../utils/logger");

/**
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
const registerAdminChatHandler = (io, socket) => {
    const { userId, role } = socket.user;

    // ── Super Admin opts in to the shared request-broadcast room ─────────────
    socket.on("admin_chat:join_support", () => {
        if (role !== "SUPER_ADMIN") {
            logger.warn("[adminChat:socket] Non-SA tried to join admin_support room", { userId, role });
            return;
        }
        socket.join("admin_support");
        logger.info("[adminChat:socket] SA joined admin_support room", { userId });
    });

    // ── Join a specific active-session room ───────────────────────────────────
    socket.on("admin_chat:join_session", ({ sessionId }) => {
        if (!sessionId) return;
        const room = `admin_session:${sessionId}`;
        socket.join(room);
        logger.info("[adminChat:socket] User joined session room", { userId, role, room });
    });

    // ── Leave a session room ──────────────────────────────────────────────────
    socket.on("admin_chat:leave_session", ({ sessionId }) => {
        if (!sessionId) return;
        const room = `admin_session:${sessionId}`;
        socket.leave(room);
        logger.info("[adminChat:socket] User left session room", { userId, role, room });
    });

    // ── Send a message within an active session ───────────────────────────────
    // NOTE: messages are NOT persisted (audit-only design).
    // If you later decide to persist them, hook into AdminChatSession or a
    // separate AdminChatMessage model here — without touching the existing
    // patient-doctor Message model.
    socket.on("admin_chat:message", ({ sessionId, text, clientMsgId }) => {
        if (!sessionId || !text?.trim()) return;

        const room    = `admin_session:${sessionId}`;
        const payload = {
            sessionId,
            senderId:    userId,
            senderRole:  role,
            text:        text.trim(),
            clientMsgId: clientMsgId || null,
            timestamp:   new Date().toISOString()
        };

        // Broadcast to everyone in the session room (including sender for echo)
        io.to(room).emit("admin_chat:message", payload);

        logger.debug("[adminChat:socket] Message relayed", { sessionId, userId, room });
    });

    // ── Typing indicator ──────────────────────────────────────────────────────
    socket.on("admin_chat:typing", ({ sessionId, isTyping }) => {
        if (!sessionId) return;
        const room = `admin_session:${sessionId}`;

        // Emit to others in the room only (exclude the sender)
        socket.to(room).emit("admin_chat:typing", {
            sessionId,
            senderId:  userId,
            senderRole: role,
            isTyping:  !!isTyping
        });
    });

    // ── Cleanup on disconnect ─────────────────────────────────────────────────
    socket.on("disconnect", () => {
        logger.debug("[adminChat:socket] Socket disconnected", { userId, role });
        // Socket.IO automatically removes the socket from all rooms on disconnect.
    });
};

module.exports = { registerAdminChatHandler };
