import { Controller, All, Req, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
/**
 * Appointment Controller
 * Routes: /api/v1/appointments/*
 * Target: appointment-service
 * Access: Authenticated users only
 */
@ApiTags('appointments')
@ApiBearerAuth('JWT-auth')
@Controller('appointments')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class AppointmentController {
  constructor(private readonly httpProxyService: HttpProxyService) { }

  /** Base path: GET /api/v1/appointments (list), POST /api/v1/appointments (create), etc. */
  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /** Subpaths: /api/v1/appointments/:id, /api/v1/appointments/slots/..., etc. */
  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    // Use originalUrl (path only, no query) for correct path
    const rawUrl = (req as any).originalUrl || req.url || '';
    const incomingPath = rawUrl.split('?')[0];
    // Replace /api/v1/appointments with /api/appointments for service routes
    // Handle slots routes: /api/v1/appointments/slots -> /api/slots
    let path = incomingPath.replace(/^\/api\/v1\/appointments/, '') || '';
    if (path.startsWith('/slots')) {
      path = path.replace('/slots', '/api/slots');
    } else {
      path = `/api/appointments${path || ''}`;
    }
    const user = (req as any).user;

    try {
      const response = await this.httpProxyService.proxyRequest('APPOINTMENT', {
        method: req.method,
        url: path || '/',
        headers: this.extractHeaders(req),
        body: req.body,
        query: req.query as Record<string, any>,
        correlationId,
        userId: user?.userId,
        role: user?.role,
        tenantId: user?.tenantId,
      });

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

  private extractHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    const allowedHeaders = [
      'content-type', 
      'accept', 
      'x-tenant-id', 
      'authorization',
      'x-internal-secret',
      'x-internal-service-key'
    ];

    for (const [key, value] of Object.entries(req.headers)) {
      if (allowedHeaders.includes(key.toLowerCase())) {
        const val = Array.isArray(value) ? value[0] : value;
        if (typeof val === 'string') headers[key] = val;
      }
    }

    return headers;
  }
}
