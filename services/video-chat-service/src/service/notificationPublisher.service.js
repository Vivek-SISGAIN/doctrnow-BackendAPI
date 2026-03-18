"use strict";

/**
 * notificationPublisher.service.js
 *
 * Publishes unread increment notifications via Redis Pub/Sub.
 *
 * Channel: chat:unread
 * Payload:  { userId, conversationId, unreadCount, timestamp }
 *
 * Design decisions:
 *   - Uses a dedicated duplicate Redis client for publishing (best practice
 *     — do not publish on the same client used by the Socket.IO adapter).
 *   - Fire-and-forget: errors are logged as warnings only; they must
 *     never propagate to callers or break REST responses.
 *   - Client is lazily connected on first publish to avoid blocking startup.
 */

const { redisClient } = require("../config/redis");
const logger = require("../utils/logger");

const CHANNEL = "chat:unread";

// Lazily-initialised dedicated publisher client
let pubClient = null;
let connecting = false;

const getPubClient = async () => {
    if (pubClient && pubClient.isReady) return pubClient;

    if (!connecting) {
        connecting = true;
        try {
            pubClient = redisClient.duplicate();
            await pubClient.connect();
            logger.info("notificationPublisher: Redis pub client connected");
        } catch (err) {
            connecting = false;
            pubClient = null;
            throw err;
        }
    }

    return pubClient;
};

/**
 * Publishes an unread-increment event to the `chat:unread` Redis channel.
 * Fire-and-forget — errors only produce a log warning.
 *
 * @param {object} params
 * @param {string} params.userId          - Recipient user ID
 * @param {string} params.conversationId  - Conversation that has a new message
 * @param {number} params.unreadCount     - Best-effort unread count (may be approximate)
 */
const publishUnreadIncrement = ({ userId, conversationId, unreadCount }) => {
    // Intentionally NOT awaited — fire-and-forget
    (async () => {
        try {
            const client = await getPubClient();

            const payload = JSON.stringify({
                userId,
                conversationId: conversationId.toString(),
                unreadCount,
                timestamp: new Date().toISOString()
            });

            await client.publish(CHANNEL, payload);
        } catch (err) {
            logger.warn("notificationPublisher: failed to publish unread increment", {
                userId,
                conversationId,
                error: err.message
            });
        }
    })();
};

module.exports = { publishUnreadIncrement };
