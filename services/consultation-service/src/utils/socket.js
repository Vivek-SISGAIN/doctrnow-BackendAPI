const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const { redisClient } = require('../config/redis');

const CONSULTATION_ROOM_PREFIX = 'consultation:';
const DOCTOR_ROOM_PREFIX = 'doctor:';

// Same events as defined in libs/event-models/src/consultation-events.ts
const CONSULTATION_EVENTS = {
  PATIENT_JOINED_LOBBY: 'patient_joined_lobby',
  APPOINTMENT_BOOKED: 'appointment_booked',
  CONSENT_REQUESTED: 'consent_requested',
  CONSENT_ACCEPTED: 'consent_accepted',
  CONSENT_REJECTED: 'consent_rejected',
  CALL_ENDED: 'call_ended',
  CALL_EXTENDED: 'call_extended',
  DOCUMENT_UPLOADED: 'document_uploaded',
  // State triggers for React Native — pushed via Redis pub/sub from appointment-service
  APPOINTMENT_LOCK_5M: 'appointment_lock_5m',
  APPOINTMENT_JOIN_1M: 'appointment_join_1m',
};

let io;

const initializeSocket = async (server) => {
  let redisAdapterAttached = false;

  try {
    // ── Redis adapter setup ──────────────────────────────────────────────────
    // Two separate clients are required: one for publish, one for subscribe.
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
        credentials: true,
      },
      path: '/consultation-events',
      transports: ['websocket', 'polling'],
    });

    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter attached');
    redisAdapterAttached = true;
  } catch (error) {
    if (!redisAdapterAttached) {
      io = new Server(server, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
          credentials: true,
        },
        path: '/consultation-events',
        transports: ['websocket', 'polling'],
      });
      console.log('ℹ️ Redis not available, using memory adapter (local mode)');
    }
  }

  io.on('connection', async (socket) => {
    try {
      const token = socket.handshake?.auth?.token ?? socket.handshake?.query?.token;

      if (!token) {
        socket.disconnect();
        return;
      }
      const payload = verifyToken(token);
      if (!payload) {
        socket.disconnect();
        return;
      }

      socket.data.userId = payload.sub ?? payload.userId;
      socket.data.role = payload.role;

      console.log(`WebSocket client connected: ${socket.id}`);
    } catch {
      socket.disconnect();
    }

    socket.on('disconnect', () => {
      console.log(`WebSocket client disconnected: ${socket.id}`);
    });

    socket.on('join_room', (payload) => {
      const appointmentId = payload?.appointmentId;
      if (!appointmentId || typeof appointmentId !== 'string') {
        return { error: 'appointmentId required' };
      }
      const room = `${CONSULTATION_ROOM_PREFIX}${appointmentId}`;
      socket.join(room);
      return { ok: true, room };
    });

    socket.on('join_doctor_room', (payload) => {
      const doctorId = payload?.doctorId;
      if (!doctorId || typeof doctorId !== 'string') {
        return { error: 'doctorId required' };
      }
      const room = `${DOCTOR_ROOM_PREFIX}${doctorId}`;
      socket.join(room);
      return { ok: true, room };
    });
  });

  return io;
};

/**
 * Subscribe to the Redis 'appointment:state' channel published by appointment-service.
 * When APPOINTMENT_LOCK_5M or APPOINTMENT_JOIN_1M arrives, emit the corresponding
 * socket event to the consultation room so the React Native app can update its UI.
 *
 * Must be called after initializeSocket() so that `io` is initialized and
 * emitToRoom() works correctly.
 *
 * Uses redisClient.duplicate() because a Redis client in subscribe mode cannot
 * send any other commands — a dedicated connection is required.
 */
const initializeAppointmentStateSubscriber = async () => {
  let subscriber;
  try {
    subscriber = redisClient.duplicate();
    await subscriber.connect();

    await subscriber.subscribe("appointment:state", (message) => {
      try {
        console.log(`[Socket] Received message on appointment:state: ${message}`);
        const { type, appointmentId } = JSON.parse(message);

        if (!appointmentId || typeof appointmentId !== "string") {
          console.warn("[Socket] appointment:state message missing appointmentId — skipping");
          return;
        }

        if (type === "APPOINTMENT_LOCK_5M") {
          console.log(`[Socket] Triggering APPOINTMENT_LOCK_5M emission for ${appointmentId}`);
          emitToRoom(appointmentId, CONSULTATION_EVENTS.APPOINTMENT_LOCK_5M, {
            appointmentId,
            type: "APPOINTMENT_LOCK_5M",
          });
          console.log(`✅ [Socket] Emitted appointment_lock_5m for ${appointmentId}`);
        } else if (type === "APPOINTMENT_JOIN_1M") {
          console.log(`[Socket] Triggering APPOINTMENT_JOIN_1M emission for ${appointmentId}`);
          emitToRoom(appointmentId, CONSULTATION_EVENTS.APPOINTMENT_JOIN_1M, {
            appointmentId,
            type: "APPOINTMENT_JOIN_1M",
          });
          console.log(`✅ [Socket] Emitted appointment_join_1m for ${appointmentId}`);
        } else {
          console.warn(`[Socket] appointment:state unknown type '${type}' — skipping`);
        }
      } catch (err) {
        console.error("[Socket] appointment:state message parse error:", err.message);
      }
    });

    console.log("✅ [Socket] Subscribed to Redis channel: appointment:state");
  } catch (err) {
    // Log but do not crash — the main socket server must still start even if
    // Redis pub/sub subscriber setup fails (e.g. Redis temporarily unavailable).
    console.error(
      "[Socket] Failed to initialize appointment:state subscriber — RN state triggers will not work:",
      err.message
    );
  }

  return subscriber;
};

const verifyToken = (token) => {
  try {
    const secret = process.env.JWT_SECRET || process.env.JWT_PUBLIC_KEY || 'dev-secret';
    if (secret && token.split('.').length === 3) {
      // Only try parsing the base64 part just like the gateway did, or verify fully
      // Currently matching Gateway logic roughly: either verify using secret or decode base64
      try {
        return jwt.verify(token, secret);
      } catch (e) {
        const parts = token.split('.');
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf8'),
        );
        return payload;
      }
    }
  } catch (err) {
    return null;
  }
};

const emitToRoom = (appointmentId, event, data) => {
  if (!io) {
    console.warn(`[SOCKET ERROR] Cannot emit ${event}: io is not initialized`);
    return;
  }
  const room = `${CONSULTATION_ROOM_PREFIX}${appointmentId}`;
  console.log(`[SOCKET DEBUG] Emitting ${event} to room ${room}`);
  console.log(`[SOCKET DEBUG] Data:`, JSON.stringify(data));
  io.to(room).emit(event, data);
};

const emitToDoctorRoom = (doctorId, event, data) => {
  if (!io) return;
  const room = `${DOCTOR_ROOM_PREFIX}${doctorId}`;
  console.log(`Emitting ${event} to doctor room ${room} with data:`, data);
  io.to(room).emit(event, data);
};

/**
 * Emit DOCUMENT_UPLOADED to the consultation's appointment room.
 * This notifies the doctor in real-time that a patient has uploaded a document.
 * @param {string} appointmentId  The appointment room to target
 * @param {{ consultationId: string, patientId: string, documentId: string }} payload
 */
const emitDocumentUploaded = (appointmentId, payload) => {
  emitToRoom(appointmentId, CONSULTATION_EVENTS.DOCUMENT_UPLOADED, payload);
};

module.exports = {
  initializeSocket,
  initializeAppointmentStateSubscriber,
  emitToRoom,
  emitToDoctorRoom,
  emitDocumentUploaded,
  CONSULTATION_EVENTS,
};
