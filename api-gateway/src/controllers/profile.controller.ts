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
@Controller('v1/profiles')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    const path = req.url.replace('/api/v1/profiles', ''); // Remove prefix
    const user = (req as any).user;

    try {
      const response = await this.httpProxyService.proxyRequest('PROFILE', {
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

