import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export const initializeSockets = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join', (userId: string) => {
      socket.join(userId);
      console.log(`[Socket.IO] Socket ${socket.id} joined room ${userId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
};

export const emitToUser = (userId: string, event: string, payload: any) => {
  if (io) {
    io.to(userId).emit(event, payload);
    console.log(`[Socket.IO] Emitted event '${event}' to room '${userId}'`);
  }
};
