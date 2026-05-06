import { Controller, All, Req, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Admin Chat Controller
 * Routes: /api/v1/admin-chat/*
 * Target: video-chat-service
 */
@ApiTags('admin-chat')
@ApiBearerAuth('JWT-auth')
@Controller('admin-chat')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class AdminChatController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @All('*')
  async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    const rawUrl = (req as any).originalUrl || req.url || '';
    const strippedPath = rawUrl.split('?')[0].replace(/^\/api\/v\d+\/admin-chat/, '');
    const path = `/api/admin-chat${strippedPath}`.replace('//', '/');
    const user = (req as any).user;

    try {
      const isMultipart = req.headers['content-type']?.startsWith('multipart/');
      const response = await this.httpProxyService.proxyRequest('VIDEO_CHAT', {
        method: req.method,
        url: path,
        headers: this.extractHeaders(req),
        body: isMultipart ? req : req.body,
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
      'content-length',
      'accept',
      'x-tenant-id',
      'authorization',
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
