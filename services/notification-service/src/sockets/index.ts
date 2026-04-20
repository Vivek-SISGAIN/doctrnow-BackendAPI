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
