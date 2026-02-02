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

/**
 * Appointment Controller
 * Routes: /api/v1/appointments/*
 * Target: appointment-service
 * Access: Authenticated users only
 */
@ApiTags('appointments')
@ApiBearerAuth('JWT-auth')
@Controller('v1/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    // Replace /api/v1/appointments with /api/appointments for service routes
    // Handle slots routes: /api/v1/appointments/slots -> /api/slots
    let path = req.url.replace('/api/v1/appointments', '');
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
      res.status(status).json({
        error: {
          code: 'PROXY_ERROR',
          message: error.message || 'Internal server error',
          correlationId,
        },
      });
    }
  }

  private extractHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    const allowedHeaders = ['content-type', 'accept', 'x-tenant-id'];

    for (const [key, value] of Object.entries(req.headers)) {
      if (allowedHeaders.includes(key.toLowerCase())) {
        headers[key] = Array.isArray(value) ? value[0] : value;
      }
    }

    return headers;
  }
}

