import {
  Controller,
  All,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Cerner FHIR R4 Controller
 * Routes: /api/v1/fhir/*
 * Target: payment-insurance-service (/api/fhir)
 * Access: Authenticated users only
 */
@ApiTags('fhir')
@ApiBearerAuth('JWT-auth')
@Controller('fhir')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class FhirController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  /** Base path: GET /api/v1/fhir, etc. */
  @All()
  @ApiOperation({ summary: 'Proxy FHIR base requests to payment-insurance-service' })
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /** Subpaths: /api/v1/fhir/Patient, /api/v1/fhir/Observation, /api/v1/fhir/patient-summary/:id, etc. */
  @All('*')
  @ApiOperation({ summary: 'Proxy FHIR subpath requests to payment-insurance-service' })
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      ((req as any).id as string) ||
      `req-${Date.now()}`;
    const rawUrl = (req as any).originalUrl || req.url || '';
    const incomingPath = rawUrl.split('?')[0];
    const suffix = incomingPath.replace(/^\/api\/v1\/fhir/, '') || '';
    const path = `/api/fhir${suffix}`;
    const user = (req as any).user;
    const userId = user?.userId ?? user?.sub;

    try {
      const response = await this.httpProxyService.proxyRequest('PAYMENT', {
        method: req.method,
        url: path,
        headers: this.extractHeaders(req),
        body: req.body,
        query: req.query as Record<string, any>,
        correlationId,
        userId,
        role: user?.role,
        tenantId: user?.tenantId,
        hospitalId: user?.hospitalId,
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const downstream = error?.data || error?.response?.data;
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
      'x-correlation-id',
      'x-client',
      'x-internal-secret',
      'x-internal-service-key',
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
