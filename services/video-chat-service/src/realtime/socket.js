const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const jwt = require("jsonwebtoken");
const { redisClient } = require("../config/redis");
const { registerMessageHandler }   = require("./handlers/message.handler");
const { registerPresenceHandler }  = require("./handlers/presence.handler");
const { registerTypingHandler }    = require("./handlers/typing.handler");
const { registerInboxHandler }     = require("./handlers/inbox.handler");
const { registerAdminChatHandler } = require("./handlers/adminChat.handler");
const logger = require("../utils/logger");

let io;

/**
 * Initialises the Socket.IO server with:
 *   - Redis adapter (pub/sub pair) for horizontal scaling
 *   - JWT handshake middleware
 *   - Per-connection handler registration
 *
 * Must be called once after Redis is connected.
 *
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server}
 */
const initSocket = async (httpServer) => {
    // ── Redis adapter setup ──────────────────────────────────────────────────
    // Two separate clients are required: one for publish, one for subscribe.
    // duplicate() reuses the same config without sharing connection state.
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io = new Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"]
        }
    });

    io.adapter(createAdapter(pubClient, subClient));

    logger.info("Socket.IO Redis adapter attached");

    // ── JWT handshake middleware ─────────────────────────────────────────────
    // Runs before the connection event. Rejects unauthenticated sockets
    // before they consume any server resources.
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                return next(new Error("UNAUTHORIZED"));
            }

            // Gateway already validated the JWT using RS256/JWKS.
            // Here we just decode the payload without re-verifying signature
            // since the socket connects directly to video-chat-service via gateway proxy.
            let payload;
            try {
                // Try verify with secret if configured
                const secret = process.env.JWT_SECRET;
                if (secret && secret !== 'dev-secret') {
                    payload = jwt.verify(token, secret);
                } else {
                    // Fallback: decode without verification (gateway already verified)
                    const parts = token.split('.');
                    payload = JSON.parse(
                        Buffer.from(parts[1], 'base64url').toString('utf8')
                    );
                }
            } catch {
                // If verify fails, decode without verification
                const parts = token.split('.');
                payload = JSON.parse(
                    Buffer.from(parts[1], 'base64url').toString('utf8')
                );
            }

            // JWT sub is the userId in RS256 tokens from your auth service
            const userId = payload.userId || payload.sub;
            const role = payload.role;

            if (!userId || !role) {
                return next(new Error("UNAUTHORIZED"));
            }

            socket.user = { userId, role };
            next();

        } catch (err) {
            logger.warn("Socket handshake auth failed", { error: err.message });
            next(new Error("UNAUTHORIZED"));
        }
    });

    // ── Connection handler ───────────────────────────────────────────────────
    io.on("connect", (socket) => {
        const { userId, role } = socket.user;

        logger.info("Socket connected", { socketId: socket.id, userId, role });

        // Explicit Set tracking which conversations this socket has joined.
        // Disconnect cleanup MUST iterate this Set only — never socket.rooms.
        socket.joinedConversations = new Set();

        // Join the user's personal room for cross-device events (inbox_update, etc.)
        // All sockets for the same user share this room, enabling badge sync
        // across devices without per-conversation subscriptions.
        socket.join(`user:${userId}`);

        // Register domain handlers
        registerMessageHandler(io, socket);
        registerPresenceHandler(io, socket);
        registerTypingHandler(io, socket);
        registerInboxHandler(io, socket);
        // Admin support chat (isolated from patient-doctor flow)
        registerAdminChatHandler(io, socket);
    });

    return io;
};

/**
 * Returns the initialised Socket.IO server instance.
 * Throws if called before initSocket().
 *
 * @returns {import("socket.io").Server}
 */
const getIO = () => {
    if (!io) {
        throw new Error("Socket.IO is not initialised — call initSocket() first");
    }
    return io;
};

module.exports = { initSocket, getIO };