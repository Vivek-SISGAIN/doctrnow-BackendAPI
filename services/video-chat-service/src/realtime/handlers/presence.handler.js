const conversationService = require("../../service/conversation.service");
const consultationSessionService = require("../../service/consultationSession.service");
const { addPresence, removePresence, getPresence } = require("../presence");
const logger = require("../../utils/logger");

// Statuses where the chat history is NOT viewable — join is rejected
const JOIN_BLOCKED_STATUSES = ["NOT_STARTED", "CANCELLED"];

// Maximum number of conversations a single socket may join
const MAX_ROOMS_PER_SOCKET = 10;

/**
 * Registers presence-related socket event handlers.
 *
 * Handles: join_conversation, leave_conversation, disconnect.
 *
 * Maintains socket.joinedConversations (Set) as the authoritative
 * record of rooms this socket has joined. Disconnect cleanup iterates
 * this Set exclusively — never socket.rooms — so behaviour is predictable
 * regardless of Socket.IO internals.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
const registerPresenceHandler = (io, socket) => {
    const { userId, role } = socket.user;

    // ── join_conversation ────────────────────────────────────────────────────
    socket.on("join_conversation", async ({ conversationId, consultationId } = {}) => {
        try {
            // 1. Input validation
            if (!conversationId || !consultationId) {
                socket.emit("error", {
                    code: "INVALID_INPUT",
                    message: "conversationId and consultationId are required"
                });
                return;
            }

            // 2. Max-rooms safeguard
            if (socket.joinedConversations.size >= MAX_ROOMS_PER_SOCKET) {
                socket.emit("error", {
                    code: "MAX_ROOMS_EXCEEDED",
                    message: `Cannot join more than ${MAX_ROOMS_PER_SOCKET} conversations per connection`
                });
                return;
            }

            // 3. Session visibility gate — only allow join when history is viewable
            const session = await consultationSessionService.getSessionByConsultationId(consultationId);

            if (JOIN_BLOCKED_STATUSES.includes(session.status)) {
                socket.emit("error", {
                    code: "CHAT_NOT_ACCESSIBLE",
                    message: `Chat is not accessible in session status: ${session.status}`
                });
                return;
            }

            // 4. Participant access validation
            await conversationService.validateParticipantAccess(conversationId, userId);

            // 5. Join room + track on socket
            socket.join(conversationId);
            socket.joinedConversations.add(conversationId);

            // 6. Update Redis presence
            await addPresence(conversationId, userId);

            // 7. Notify the whole room about this user coming online
            io.to(conversationId).emit("presence_update", {
                conversationId,
                userId,
                status: "online"
            });

            // 8. Send full presence snapshot ONLY to the joining socket
            const onlineUserIds = await getPresence(conversationId);
            socket.emit("presence_snapshot", { conversationId, onlineUserIds });

            logger.info("Socket joined conversation", { userId, role, conversationId });
        } catch (err) {
            logger.error("join_conversation error", { userId, error: err.message });
            socket.emit("error", {
                code: "JOIN_FAILED",
                message: err.message
            });
        }
    });

    // ── leave_conversation ───────────────────────────────────────────────────
    socket.on("leave_conversation", async ({ conversationId } = {}) => {
        try {
            if (!conversationId) return;

            socket.leave(conversationId);
            socket.joinedConversations.delete(conversationId);

            await removePresence(conversationId, userId);

            io.to(conversationId).emit("presence_update", {
                conversationId,
                userId,
                status: "offline"
            });

            logger.info("Socket left conversation", { userId, conversationId });
        } catch (err) {
            logger.error("leave_conversation error", { userId, error: err.message });
        }
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    // Iterate the explicit joinedConversations Set only — never socket.rooms.
    socket.on("disconnect", async () => {
        try {
            for (const conversationId of socket.joinedConversations) {
                await removePresence(conversationId, userId);

                io.to(conversationId).emit("presence_update", {
                    conversationId,
                    userId,
                    status: "offline"
                });
            }

            logger.info("Socket disconnected — presence cleaned up", {
                userId,
                roomCount: socket.joinedConversations.size
            });
        } catch (err) {
            logger.error("disconnect presence cleanup error", { userId, error: err.message });
        }
    });
};

module.exports = { registerPresenceHandler };
