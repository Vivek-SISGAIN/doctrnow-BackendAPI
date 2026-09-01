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
 * Insurance Controller
 * Routes: /api/v1/insurance/*
 * Target: payment-insurance-service (/api/insurance)
 * Access: Authenticated users only
 */
@ApiTags('insurance')
@ApiBearerAuth('JWT-auth')
@Controller('insurance')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class InsuranceController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  /** Base path: GET /api/v1/insurance, POST /api/v1/insurance, etc. */
  @All()
  @ApiOperation({ summary: 'Proxy insurance base requests to payment-insurance-service' })
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /** Subpaths: /api/v1/insurance/coverage/:emiratesId, /api/v1/insurance/claims, etc. */
  @All('*')
  @ApiOperation({ summary: 'Proxy insurance subpath requests to payment-insurance-service' })
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      ((req as any).id as string) ||
      `req-${Date.now()}`;
    const rawUrl = (req as any).originalUrl || req.url || '';
    const incomingPath = rawUrl.split('?')[0];
    const suffix = incomingPath.replace(/^\/api\/v1\/insurance/, '') || '';
    const path = `/api/insurance${suffix}`;
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
