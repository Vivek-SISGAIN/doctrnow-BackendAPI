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
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.API_GATEWAY || "http://localhost:8080/api/v1";
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || process.env.INTERNAL_SERVICE_SECRET || process.env.INTERNAL_SECRET;

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

const triggerInAppNotification = ({ userId, title, body, payload }) => {
    (async () => {
        try {
            const response = await fetch(`${API_GATEWAY_URL}/notifications/single`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(INTERNAL_SERVICE_KEY ? { 
                        "x-internal-service-key": INTERNAL_SERVICE_KEY,
                        "x-internal-secret": INTERNAL_SERVICE_KEY
                    } : {})
                },
                body: JSON.stringify({
                    userId,
                    channels: ["IN_APP", "PUSH"],
                    title,
                    body,
                    payload
                })
            });

            if (!response.ok) {
                const bodyText = await response.text();
                logger.warn("notificationPublisher: failed to trigger notification", {
                    userId,
                    status: response.status,
                    body: bodyText
                });
            }
        } catch (err) {
            logger.warn("notificationPublisher: failed to call notification trigger", {
                userId,
                error: err.message
            });
        }
    })();
};

const resolveDisplayName = async (role, userId, fallback) => {
    const path = role === "DOCTOR" ? "/profiles/doctors/bulk" : "/profiles/patients/bulk";

    try {
        const response = await fetch(`${API_GATEWAY_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(INTERNAL_SERVICE_KEY ? { 
                    "x-internal-service-key": INTERNAL_SERVICE_KEY,
                    "x-internal-secret": INTERNAL_SERVICE_KEY
                } : {})
            },
            body: JSON.stringify({ ids: [userId] })
        });

        if (!response.ok) return fallback;
        const json = await response.json();
        const profile = json.data?.[userId];
        return (
            profile?.fullName ||
            [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() ||
            profile?.name ||
            fallback
        );
    } catch (err) {
        logger.warn("notificationPublisher: failed to resolve display name", {
            role,
            userId,
            error: err.message
        });
        return fallback;
    }
};

module.exports = { publishUnreadIncrement, triggerInAppNotification, resolveDisplayName };
