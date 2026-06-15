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
const AdminChatMessage = require("../../models/adminChatMessage.model");
const AdminChatSession = require("../../models/adminChatSession.model");
const { triggerInAppNotification } = require("../../service/notificationPublisher.service");

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
    socket.on("admin_chat:message", ({ sessionId, text, clientMsgId, attachments }) => {
        const hasText = text && text.trim();
        const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
        if (!sessionId || (!hasText && !hasAttachments)) return;

        const room    = `admin_session:${sessionId}`;
        const payload = {
            id:          clientMsgId || `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sessionId,
            senderId:    userId,
            senderRole:  role,
            text:        hasText ? text.trim() : "",
            clientMsgId: clientMsgId || null,
            timestamp:   new Date().toISOString(),
            createdAt:   new Date().toISOString(),
            attachments: hasAttachments ? attachments : [],
        };

        // Broadcast to everyone in the session room (including sender for echo)
        io.to(room).emit("admin_chat:message", payload);

        logger.debug("[adminChat:socket] Message relayed", { sessionId, userId, room });

        // Asynchronously save to MongoDB
        (async () => {
            try {
                const newMsg = await AdminChatMessage.create({
                    sessionId,
                    senderId: userId,
                    senderRole: role,
                    text: hasText ? text.trim() : "",
                    clientMsgId: clientMsgId || null,
                    readBy: [],
                    attachments: hasAttachments ? attachments : [],
                });

                const session = await AdminChatSession.findByIdAndUpdate(sessionId, {
                    lastMessagePreview: hasText ? text.trim().slice(0, 120) : "📎 Attachment",
                    lastMessageAt: new Date()
                });

                if (session) {
                    // Identify the recipient
                    let recipientId = null;
                    if (role === "SUPER_ADMIN") {
                        recipientId = session.hospitalAdminId || session.doctorId || session.patientId;
                    } else {
                        recipientId = session.superAdminId;
                    }

                    if (recipientId) {
                        triggerInAppNotification({
                            userId: recipientId,
                            title: `Support Message from ${role.replace("_", " ")}`,
                            body: hasText ? text.trim() : "Sent an attachment",
                            payload: {
                                type: "ADMIN_CHAT_MESSAGE",
                                sessionId,
                                senderId: userId,
                                senderRole: role,
                                senderName: role === "SUPER_ADMIN" ? (session.superAdminName || "Super Admin") : (session.requesterName || "User")
                            }
                        });
                    }
                }
            } catch (err) {
                logger.error("[adminChat:socket] Failed to persist message", { error: err.message, sessionId });
            }
        })();
    });

    // ── Read Receipts ─────────────────────────────────────────────────────────
    socket.on("admin_chat:read_receipt", async ({ sessionId, messageIds }) => {
        if (!sessionId || !messageIds || !messageIds.length) return;

        try {
            const room = `admin_session:${sessionId}`;
            const readAtDate = new Date();

            await AdminChatMessage.updateMany(
                { _id: { $in: messageIds }, "readBy.userId": { $ne: userId } },
                { $push: { readBy: { userId, readAt: readAtDate } } }
            );

            io.to(room).emit("admin_chat:messages_read", {
                sessionId,
                readBy: userId,
                messageIds,
                readAt: readAtDate.toISOString()
            });
            logger.debug("[adminChat:socket] Read receipt processed", { sessionId, userId, count: messageIds.length });
        } catch (err) {
            logger.error("[adminChat:socket] Failed to process read receipt", { error: err.message, sessionId });
        }
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
