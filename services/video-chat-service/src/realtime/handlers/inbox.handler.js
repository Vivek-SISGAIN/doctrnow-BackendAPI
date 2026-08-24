"use strict";

const { markConversationRead } = require("../../service/conversationInbox.service");
const logger = require("../../utils/logger");

/**
 * Registers the `conversation_read` socket event handler.
 *
 * Client sends:
 *   conversation_read  { conversationId: string }
 *
 * Server responds:
 *   - persists lastReadMessageAt = now for this participant (atomic)
 *   - emits `inbox_update` to the user's personal room so other devices
 *     (same userId) get an unread-badge refresh without a full inbox reload.
 *   - emits `error` back to this socket only if something fails.
 *
 * The user's personal room name convention: `user:<userId>`
 * Clients must join this room on connect (the presence handler or connection
 * bootstrap does this automatically).
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
const registerInboxHandler = (io, socket) => {
    const { userId } = socket.user;

    // ── conversation_read ─────────────────────────────────────────────────────
    socket.on("conversation_read", async ({ conversationId } = {}) => {
        try {
            // 1. Validate input
            if (!conversationId || typeof conversationId !== "string") {
                socket.emit("error", {
                    code: "INVALID_INPUT",
                    message: "conversationId is required"
                });
                return;
            }

            // 2. Atomic write: update this participant's lastReadMessageAt
            const result = await markConversationRead({ conversationId, userId });

            // 3. Broadcast inbox_update to all other devices of the same user.
            //    We emit to the user's personal room, excluding this socket so
            //    the originating device doesn't re-render unnecessarily.
            socket
                .to(`user:${userId}`)
                .emit("inbox_update", {
                    type: "read",
                    conversationId,
                    readAt: result.readAt.toISOString(),
                    unreadCount: 0   // optimistic: this device just read everything
                });

            logger.info("conversation_read handled", { userId, conversationId });

        } catch (err) {
            const code =
                err.name === "ForbiddenError" ? "FORBIDDEN" :
                err.name === "NotFoundError"  ? "NOT_FOUND" :
                "READ_FAILED";

            logger.error("conversation_read error", {
                userId,
                conversationId,
                error: err.message
            });

            socket.emit("error", { code, message: err.message });
        }
    });
};

module.exports = { registerInboxHandler };
