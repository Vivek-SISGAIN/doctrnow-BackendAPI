import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export const CONSULTATION_ROOM_PREFIX = 'consultation:';
export const DOCTOR_ROOM_PREFIX = 'doctor:';

export const CONSULTATION_EVENTS = {
  PATIENT_JOINED_LOBBY: 'patient_joined_lobby',
  CONSENT_REQUESTED: 'consent_requested',
  CONSENT_ACCEPTED: 'consent_accepted',
  CONSENT_REJECTED: 'consent_rejected',
  CALL_ENDED: 'call_ended',
} as const;

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/consultation-events',
  transports: ['websocket', 'polling'],
})
export class ConsultationEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ConsultationEventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: any) {
    try {
      const token = client.handshake?.auth?.token ?? client.handshake?.query?.token;
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.verifyToken(token);
      if (!payload) {
        client.disconnect();
        return;
      }
      client.data.userId = payload.sub ?? payload.userId;
      client.data.role = payload.role;
      this.logger.debug(`WebSocket client connected: ${client.id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: any) {
    this.logger.debug(`WebSocket client disconnected: ${client.id}`);
  }

  private async verifyToken(token: string): Promise<{ sub?: string; userId?: string; role?: string } | null> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (secret) {
        return this.jwtService.verify(token, { secret }) as { sub?: string; userId?: string; role?: string };
      }
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { sub?: string; userId?: string; role?: string };
      return payload;
    } catch {
      return null;
    }
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(client: any, payload: { appointmentId: string }) {
    const appointmentId = payload?.appointmentId;
    if (!appointmentId || typeof appointmentId !== 'string') {
      return { error: 'appointmentId required' };
    }
    const room = `${CONSULTATION_ROOM_PREFIX}${appointmentId}`;
    client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('join_doctor_room')
  handleJoinDoctorRoom(client: any, payload: { doctorId: string }) {
    const doctorId = payload?.doctorId;
    if (!doctorId || typeof doctorId !== 'string') {
      return { error: 'doctorId required' };
    }
    const room = `${DOCTOR_ROOM_PREFIX}${doctorId}`;
    client.join(room);
    this.logger.debug(`Doctor ${doctorId} joined room ${room}`);
    return { ok: true, room };
  }

  emitToRoom(appointmentId: string, event: string, data: Record<string, unknown>) {
    const room = `${CONSULTATION_ROOM_PREFIX}${appointmentId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`Emitted ${event} to room ${room}`);
  }

  emitToDoctorRoom(doctorId: string, event: string, data: Record<string, unknown>) {
    const room = `${DOCTOR_ROOM_PREFIX}${doctorId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`Emitted ${event} to doctor room ${room}`);
  }
}
