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
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Auth Controller
 * Routes: /api/v1/auth/*
 * Target: auth-service
 * Access: Public (no auth required for auth endpoints)
 */
@ApiTags('auth')
@Controller('auth')
@Public() // Auth endpoints are public (login, register, etc.)
export class AuthController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    // Auth-service uses global prefix 'auth' and version '1' -> /auth/v1/register, etc.
    const raw = ((req as any).originalUrl ?? req.url ?? '').split('?')[0];
    const suffix = raw.includes('/auth') ? (raw.replace(/.*\/auth\/?/, '/') || '/') : '/';
    const path = `/auth/v1${suffix.startsWith('/') ? suffix : '/' + suffix}`;

    try {
      const response = await this.httpProxyService.proxyRequest('AUTH', {
        method: req.method,
        url: path,
        headers: this.extractHeaders(req),
        body: req.body,
        query: req.query as Record<string, any>,
        correlationId,
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
        const val = Array.isArray(value) ? value[0] : value;
        if (typeof val === 'string') headers[key] = val;
      }
    }

    return headers;
  }
}

