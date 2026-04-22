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
  emitToRoom,
  emitToDoctorRoom,
  emitDocumentUploaded,
  CONSULTATION_EVENTS,
};
