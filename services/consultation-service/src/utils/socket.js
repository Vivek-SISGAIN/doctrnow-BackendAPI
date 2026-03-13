const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

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
};

let io;

const initializeSocket = (server) => {
  // Express Catch-All handles everything except what Socket.IO handles internally.
  // We use this path to avoid Express "Route not found" if they conflict.
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all for testing
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
      credentials: true,
    },
    path: '/consultation-events',
    transports: ['websocket', 'polling'],
  });

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
  if (!io) return;
  const room = `${CONSULTATION_ROOM_PREFIX}${appointmentId}`;
  console.log(`Emitting ${event} to room ${room} with data:`, data);
  io.to(room).emit(event, data);
};

const emitToDoctorRoom = (doctorId, event, data) => {
  if (!io) return;
  const room = `${DOCTOR_ROOM_PREFIX}${doctorId}`;
  console.log(`Emitting ${event} to doctor room ${room} with data:`, data);
  io.to(room).emit(event, data);
};

module.exports = {
  initializeSocket,
  emitToRoom,
  emitToDoctorRoom,
  CONSULTATION_EVENTS,
};
