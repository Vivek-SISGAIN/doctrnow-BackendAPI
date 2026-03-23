const { redisClient } = require("../../config/redis");
const logger = require("../../utils/logger");

// Server-side throttle window in seconds
const TYPING_THROTTLE_SECONDS = 2;

/**
 * Redis key for per-user per-conversation typing throttle.
 * TTL = TYPING_THROTTLE_SECONDS. Existence of key means "still within window".
 *
 * @param {string} userId
 * @param {string} conversationId
 * @returns {string}
 */
const throttleKey = (userId, conversationId) =>
    `typing_throttle:${userId}:${conversationId}`;

/**
 * Registers typing indicator socket event handlers.
 *
 * Handles: typing_start, typing_stop
 *
 * Throttle strategy:
 *   - typing_start is ignored (no broadcast) if a Redis TTL key exists for this
 *     userId:conversationId pair, meaning a start was already forwarded within
 *     TYPING_THROTTLE_SECONDS.
 *   - typing_stop deletes the throttle key immediately so the next typing_start
 *     is always forwarded regardless of the window.
 *
 * No MongoDB or presence writes — purely ephemeral forwarding.
 *
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket
 */
const registerTypingHandler = (io, socket) => {
    const { userId, role } = socket.user;

    // ── typing_start ─────────────────────────────────────────────────────────
    socket.on("typing_start", async ({ conversationId } = {}) => {
        try {
            if (!conversationId) return;

            // Validate socket is in the room
            if (!socket.joinedConversations.has(conversationId)) return;

            const key = throttleKey(userId, conversationId);

            // Check throttle window — if key exists, still within 2s, suppress
            const alreadyTyping = await redisClient.exists(key);

            if (alreadyTyping) return;

            // Set throttle key with TTL — marks window as open
            await redisClient.setEx(key, TYPING_THROTTLE_SECONDS, "1");

            // Broadcast to all room peers EXCEPT the sender
            socket.to(conversationId).emit("typing_start", {
                conversationId,
                userId,
                role
            });

            logger.debug("typing_start forwarded", { userId, conversationId });
        } catch (err) {
            logger.error("typing_start error", { userId, error: err.message });
        }
    });

    // ── typing_stop ──────────────────────────────────────────────────────────
    socket.on("typing_stop", async ({ conversationId } = {}) => {
        try {
            if (!conversationId) return;

            if (!socket.joinedConversations.has(conversationId)) return;

            // Delete throttle key immediately — next typing_start will go through
            await redisClient.del(throttleKey(userId, conversationId));

            socket.to(conversationId).emit("typing_stop", {
                conversationId,
                userId,
                role
            });

            logger.debug("typing_stop forwarded", { userId, conversationId });
        } catch (err) {
            logger.error("typing_stop error", { userId, error: err.message });
        }
    });
};

module.exports = { registerTypingHandler };
