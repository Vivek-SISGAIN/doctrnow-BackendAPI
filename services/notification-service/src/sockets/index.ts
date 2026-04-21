import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

type JoinPayload =
  | string
  | {
      userId?: string;
      role?: string;
      hospitalId?: string;
    };

export const initializeSockets = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join', (joinPayload: JoinPayload) => {
      const payload =
        typeof joinPayload === 'string' ? { userId: joinPayload } : joinPayload ?? {};
      const userId = payload.userId?.trim();
      const role = payload.role?.trim().toUpperCase();
      const hospitalId = payload.hospitalId?.trim();

      if (userId) {
        socket.join(userId); // backward compatible room
        socket.join(`user:${userId}`);
      }
      if (role) {
        socket.join(`role:${role}`);
      }
      if (hospitalId) {
        socket.join(`hospital:${hospitalId}`);
      }

      socket.emit('joined', { userId, role, hospitalId });
      console.log(
        `[Socket.IO] Socket ${socket.id} joined rooms: user=${userId || 'n/a'}, role=${role || 'n/a'}, hospital=${hospitalId || 'n/a'}`,
      );
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
};

export const emitToUser = (userId: string, event: string, payload: any) => {
  if (io) {
    io.to(userId).emit(event, payload);
    io.to(`user:${userId}`).emit(event, payload);
    console.log(`[Socket.IO] Emitted event '${event}' to room '${userId}'`);
  }
};

/**
 * Emit an event to every connected socket that joined a given role room.
 * e.g. emitToRole('HOSPITAL_ADMIN', 'notification', payload)
 */
export const emitToRole = (role: string, event: string, payload: any) => {
  if (io) {
    const room = `role:${role.toUpperCase()}`;
    io.to(room).emit(event, payload);
    console.log(`[Socket.IO] Emitted event '${event}' to role room '${role}'`);
  }
};

/**
 * Broadcast a banner-created event to every portal that should see it.
 *
 * Portal → role room mapping:
 *   PATIENT  → role:PATIENT
 *   DOCTOR   → role:DOCTOR
 *   GENERAL  → role:HOSPITAL_ADMIN + role:PATIENT + role:DOCTOR
 *
 * Hospital-admin portals always receive banner events regardless of portal.
 *
 * Adding a new portal:
 *   1. Have the new portal's socket client send a `join` event with the
 *      correct `role` string when it connects.
 *   2. Add that role to the portalRoleMap below if needed.
 */
export const emitBannerEvent = (banner: {
  id: string;
  title: string;
  description: string;
  portal: string;
  createdAt?: string;
  [key: string]: unknown;
}) => {
  if (!io) return;

  const eventPayload = {
    // Prefix with 'banner:' so frontend deduplication doesn't clash with
    // real notification DB records
    id: `banner:${banner.id}`,
    type: 'banner',
    userId: '',
    channel: 'IN_APP',
    status: 'SENT',
    title: `New Banner: ${banner.title}`,
    body: banner.description || banner.title,
    payload: { type: 'BANNER', banner },
    createdAt: banner.createdAt || new Date().toISOString(),
  };

  const portalRoleMap: Record<string, string[]> = {
    PATIENT: ['role:PATIENT'],
    DOCTOR:  ['role:DOCTOR'],
    // GENERAL banners are shown on every portal
    GENERAL: ['role:HOSPITAL_ADMIN', 'role:PATIENT', 'role:DOCTOR'],
  };

  // Hospital-admin always receives banner events (they manage banners)
  const rooms = new Set<string>(['role:HOSPITAL_ADMIN']);
  const portalRooms = portalRoleMap[banner.portal?.toUpperCase()] ?? [];
  portalRooms.forEach((r) => rooms.add(r));

  rooms.forEach((room) => {
    io.to(room).emit('notification',     eventPayload);
    io.to(room).emit('notification:new', eventPayload);
    io.to(room).emit('banner:new',       eventPayload);
  });

  console.log(
    `[Socket.IO] Banner '${banner.id}' broadcast to rooms: ${[...rooms].join(', ')}`,
  );
};
