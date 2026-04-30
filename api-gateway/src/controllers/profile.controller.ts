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
import { SkipThrottle } from '@nestjs/throttler';
/**
 * Profile Controller
 * Routes: /api/v1/profiles/*
 * Target: profile-service
 * Access: Authenticated users only
 */
@ApiTags('profiles')
@ApiBearerAuth('JWT-auth')
@Controller('profiles')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly httpProxyService: HttpProxyService) { }

  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    console.log("working path")

    const correlationId = req.headers['x-correlation-id'] as string;
    const rawUrl = (req as any).originalUrl || req.url || '';
    const incomingPath = rawUrl.split('?')[0];
    // Strip gateway prefix: /api/v1/profiles/... -> /api/... (e.g. /api/patients/me)
    const pathSuffix = incomingPath.replace(/^\/api\/v1\/profiles/, '').trim() || '';
    const path = `/api${pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`}`.replace('//', '/') || '/api';
    const user = (req as any).user;
    const userId = user?.userId ?? user?.sub;

    try {
      const isMultipart = req.headers['content-type']?.startsWith('multipart/');
      const response = await this.httpProxyService.proxyRequest('PROFILE', {
        method: req.method,
        url: path,
        headers: this.extractHeaders(req),
        body: isMultipart ? req : req.body,
        query: req.query as Record<string, any>,
        correlationId,
        userId,
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

