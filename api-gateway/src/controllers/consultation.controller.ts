import {
  Controller,
  HttpStatus,
  UseGuards,
  Get,
  Post,
  Param,
  Req,
  Res,
  All,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';
/**
 * Consultation Controller
 * Routes: /api/v1/consultations/*
 * Target: consultation-service
 * Emits WebSocket events for real-time notifications (patient joined, consent, call ended)
 */
@ApiTags('consultations')
@ApiBearerAuth('JWT-auth')
@Controller('consultations')
@SkipThrottle()
@UseGuards(JwtAuthGuard)
export class ConsultationController {
  constructor(
    private readonly httpProxyService: HttpProxyService,
  ) { }

  /**
   * Public endpoint to get doctor rating
   */
  @Public()
  @Get('doctors/:doctorId/rating')
  async getRating(@Param('doctorId') doctorId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /**
   * Public endpoint to get bulk doctor ratings
   */
  @Public()
  @Post('doctors/rating/bulk')
  async getRatingsBulk(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /**
   * Public endpoint to get doctor reviews
   */
  @Public()
  @Get('doctors/:doctorId/reviews')
  async getReviews(@Param('doctorId') doctorId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

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
    const allowedHeaders = ['content-type', 'accept', 'x-tenant-id', 'authorization', 'x-user-id', 'x-user-role'];

    for (const [key, value] of Object.entries(req.headers)) {
      if (allowedHeaders.includes(key.toLowerCase())) {
        const val = Array.isArray(value) ? value[0] : value;
        if (typeof val === 'string') headers[key] = val;
      }
    }

    return headers;
  }
}

