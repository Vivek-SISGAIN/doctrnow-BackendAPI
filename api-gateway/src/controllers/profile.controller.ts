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
 * Profile Controller
 * Routes: /api/v1/profiles/*
 * Target: profile-service
 * Access: Authenticated users only
 */
@ApiTags('profiles')
@ApiBearerAuth('JWT-auth')
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    // Strip gateway prefix and query string so proxy builds URL from path + req.query (no duplicate params)
    const pathSuffix = req.url.replace('/api/v1/profiles', '').split('?')[0];
    // Profile service expects paths under /api (e.g. /api/patients)
    const path = `/api${pathSuffix || ''}`.replace('//', '/') || '/';
    const user = (req as any).user;

    try {
      const response = await this.httpProxyService.proxyRequest('PROFILE', {
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

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamMessage =
        error?.data?.message ?? error?.data?.error?.message ?? error.message;
      res.status(status).json({
        error: {
          code: 'PROXY_ERROR',
          message: upstreamMessage || 'Internal server error',
          correlationId,
        },
      });
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

