import {
  Controller,
  All,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConsultationEventsService } from '../consultation-events/consultation-events.service';

/**
 * Consultation Controller
 * Routes: /api/v1/consultations/*
 * Target: consultation-service
 * Emits WebSocket events for real-time notifications (patient joined, consent, call ended)
 */
@ApiTags('consultations')
@ApiBearerAuth('JWT-auth')
@Controller('consultations')
@UseGuards(JwtAuthGuard)
export class ConsultationController {
  constructor(
    private readonly httpProxyService: HttpProxyService,
    private readonly consultationEvents: ConsultationEventsService,
  ) {}

  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    const rawUrl = (req as any).originalUrl || req.url || '';
    const pathSuffix = rawUrl.split('?')[0].replace(/^\/api\/v1\/consultations/, '') || '';
    const path = `/api/consultations${pathSuffix}`.replace('//', '/') || '/api/consultations';
    const user = (req as any).user;

    try {
      const response = await this.httpProxyService.proxyRequest('CONSULTATION', {
        method: req.method,
        url: path,
        headers: this.extractHeaders(req),
        body: req.body,
        query: req.query as Record<string, any>,
        correlationId,
        userId: user?.userId,
        role: user?.role,
        tenantId: user?.tenantId,
      });

      if (response.status >= 200 && response.status < 300) {
        this.emitConsultationEvent(pathSuffix, response.data, req.body);
      }

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const downstream = error?.data;
      const message =
        downstream?.message ??
        downstream?.error?.message ??
        error.message ??
        'Internal server error';
      res.status(status).json({
        error: {
          code: downstream?.error?.code ?? 'PROXY_ERROR',
          message,
          correlationId,
          ...(downstream && { details: downstream }),
        },
      });
    }
  }

  private emitConsultationEvent(pathSuffix: string, data: any, body: any): void {
    const joinLobbyMatch = pathSuffix.match(/^\/appointment\/([^/]+)\/join-lobby$/);
    const requestConsentMatch = pathSuffix.match(/^\/appointment\/([^/]+)\/request-consent$/);
    const acceptConsentMatch = pathSuffix.match(/^\/appointment\/([^/]+)\/accept-consent$/);
    const endMatch = pathSuffix.match(/^\/appointment\/([^/]+)\/end$/);

    if (joinLobbyMatch) {
      const appointmentId = joinLobbyMatch[1];
      const consultationId = data?.data?.id;
      const doctorId = body?.doctorId;
      this.consultationEvents.patientJoinedLobby(appointmentId, consultationId, doctorId);
    } else if (requestConsentMatch) {
      const appointmentId = requestConsentMatch[1];
      const consultationId = data?.data?.id;
      this.consultationEvents.consentRequested(appointmentId, consultationId);
    } else if (acceptConsentMatch) {
      const appointmentId = acceptConsentMatch[1];
      const consultationId = data?.data?.id;
      this.consultationEvents.consentAccepted(appointmentId, consultationId);
    } else if (endMatch) {
      const appointmentId = endMatch[1];
      const endedBy = (body?.endedBy === 'patient' ? 'patient' : 'doctor') as 'doctor' | 'patient';
      const consultationId = data?.data?.id;
      this.consultationEvents.callEnded(appointmentId, endedBy, consultationId);
      this.markAppointmentCompleted(appointmentId).catch(() => {});
    }
  }

  private async markAppointmentCompleted(appointmentId: string): Promise<void> {
    try {
      await this.httpProxyService.proxyRequest('APPOINTMENT', {
        method: 'POST',
        url: `/api/appointments/${appointmentId}/complete`,
        headers: { 'Content-Type': 'application/json' },
        body: {},
        query: {},
        correlationId: `complete-${appointmentId}`,
      });
    } catch {
      // Appointment service may be unavailable; consultation is still completed
    }
  }

  private extractHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    const allowedHeaders = ['content-type', 'accept', 'x-tenant-id', 'authorization'];

    for (const [key, value] of Object.entries(req.headers)) {
      if (allowedHeaders.includes(key.toLowerCase())) {
        const val = Array.isArray(value) ? value[0] : value;
        if (typeof val === 'string') headers[key] = val;
      }
    }

    return headers;
  }
}

