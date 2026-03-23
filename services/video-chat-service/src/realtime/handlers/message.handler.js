const Conversation = require("../../models/conversation.model");
const Message = require("../../models/message.model");
const logger = require("../../utils/logger");

// Maximum number of messageIds allowed in a single ACK batch
const MAX_ACK_BATCH_SIZE = 50;

/**
 * Registers message-related socket event handlers.
 *
 * Handles: message_delivered, message_read
 *
 * Design notes:
 *   - Uses $addToSet to guarantee idempotency under concurrent duplicate events.
 *   - Does NOT touch message.status — read state is derived client-side from
 *     the readBy array for the requesting userId.
 *   - Input is validated before any DB writes.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
const registerMessageHandler = (io, socket) => {
    const { userId } = socket.user;

    // ── message_delivered ────────────────────────────────────────────────────
    socket.on("message_delivered", async ({ conversationId, messageIds } = {}) => {
        try {
            // 1. Validate inputs
            if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) {
                socket.emit("error", {
                    code: "INVALID_INPUT",
                    message: "conversationId and non-empty messageIds[] are required"
                });
                return;
            }

            if (messageIds.length > MAX_ACK_BATCH_SIZE) {
                socket.emit("error", {
                    code: "BATCH_TOO_LARGE",
                    message: `messageIds batch exceeds maximum of ${MAX_ACK_BATCH_SIZE}`
                });
                return;
            }

            // 2. Validate socket is in the room
            if (!socket.joinedConversations.has(conversationId)) {
                socket.emit("error", {
                    code: "NOT_IN_ROOM",
                    message: "You must join the conversation before sending ACKs"
                });
                return;
            }

            // 3. Bulk-persist delivery — $addToSet prevents duplicate entries
            const now = new Date();

            await Message.updateMany(
                { _id: { $in: messageIds }, conversationId },
                {
                    $addToSet: {
                        deliveredTo: { userId, deliveredAt: now }
                    }
                }
            );

            logger.info("Bulk delivery ACK persisted", {
                userId,
                conversationId,
                count: messageIds.length
            });

            // 4. Broadcast delivery acknowledgement to the whole room
            io.to(conversationId).emit("delivery_ack", {
                conversationId,
                messageIds,
                userId,
                deliveredAt: now.toISOString()
            });
        } catch (err) {
            logger.error("message_delivered error", { userId, error: err.message });
            socket.emit("error", { code: "DELIVERY_ACK_FAILED", message: err.message });
        }
    });

    // ── message_read ─────────────────────────────────────────────────────────
    socket.on("message_read", async ({ conversationId, messageIds } = {}) => {
        try {
            // 1. Validate inputs
            if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) {
                socket.emit("error", {
                    code: "INVALID_INPUT",
                    message: "conversationId and non-empty messageIds[] are required"
                });
                return;
            }

            if (messageIds.length > MAX_ACK_BATCH_SIZE) {
                socket.emit("error", {
                    code: "BATCH_TOO_LARGE",
                    message: `messageIds batch exceeds maximum of ${MAX_ACK_BATCH_SIZE}`
                });
                return;
            }

            // 2. Validate socket is in the room
            if (!socket.joinedConversations.has(conversationId)) {
                socket.emit("error", {
                    code: "NOT_IN_ROOM",
                    message: "You must join the conversation before sending ACKs"
                });
                return;
            }

            // 3. Bulk-persist read receipt — $addToSet prevents duplicates.
            //    message.status is intentionally NOT updated here.
            //    Clients derive read state from readBy[] per their own userId.
            const now = new Date();

            await Message.updateMany(
                { _id: { $in: messageIds }, conversationId },
                {
                    $addToSet: {
                        readBy: { userId, readAt: now }
                    }
                }
            );

            // FIX: Also update lastReadMessageAt on the conversation participant
            //      This is what the unread count query uses
            await Conversation.findOneAndUpdate(
                { _id: conversationId, 'participants.userId': userId },
                { $set: { 'participants.$[p].lastReadMessageAt': now } },
                { arrayFilters: [{ 'p.userId': userId }], runValidators: false }
            );

            logger.info("Bulk read ACK persisted", {
                userId,
                conversationId,
                count: messageIds.length
            });

            // 4. Broadcast read acknowledgement to the whole room
            io.to(conversationId).emit("read_ack", {
                conversationId,
                messageIds,
                userId,
                readAt: now.toISOString()
            });
        } catch (err) {
            logger.error("message_read error", { userId, error: err.message });
            socket.emit("error", { code: "READ_ACK_FAILED", message: err.message });
        }
    });
};

module.exports = { registerMessageHandler };
