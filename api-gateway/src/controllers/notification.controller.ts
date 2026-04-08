import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/common/decorators/public.decorator';

/**
 * Notification Controller
 *
 * Proxies all requests under the following gateway paths to notification-service:
 *   /api/v1/notifications/*  → notification-service  POST /api/notifications
 *   /api/v1/devices/*        → notification-service  POST /api/devices
 *   /api/v1/otp/*            → notification-service  POST /api/otp/send
 *
 * notification-service base URL is configured via NOTIFICATION_SERVICE_URL
 * (default: http://localhost:3008). The service mounts its routes at /api.
 *
 * Access:
 *   - POST /notifications, POST /devices — authenticated users (all roles)
 *   - POST /otp/*              — authenticated users (all roles)
 *   - GET  /notifications/*    — authenticated users (all roles) — future-proofed
 */
@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller()   // No shared prefix — each subpath has its own @Controller below
@SkipThrottle() // Rate limiting handled at service level
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  // ─── /api/v1/notifications ───────────────────────────────────────────────────

  @Post('notifications')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a notification (all channels)' })
  async createNotification(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res, '/api/notifications');
  }

  @Get('notifications')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  async listNotifications(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res, '/api/notifications');
  }

  @Get('notifications/*')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a specific notification' })
  async getNotification(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyToService(req, res, '/api/v1/notifications', '/api/notifications');
  }

  @Patch('notifications/*')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update (e.g. mark-as-read) a notification' })
  async patchNotification(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyToService(req, res, '/api/v1/notifications', '/api/notifications');
  }

  @Delete('notifications/*')
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a notification (admin only)' })
  async deleteNotification(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyToService(req, res, '/api/v1/notifications', '/api/notifications');
  }

  // ─── /api/v1/devices ─────────────────────────────────────────────────────────

  @Post('devices')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Register a device for push notifications' })
  async registerDevice(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res, '/api/devices');
  }

  @Delete('devices/*')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Unregister a push-notification device' })
  async deleteDevice(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyToService(req, res, '/api/v1/devices', '/api/devices');
  }

  // ─── /api/v1/otp ─────────────────────────────────────────────────────────────

  @Post('otp/send')
  @Public()
  @ApiOperation({ summary: 'Send an OTP via EMAIL or SMS' })
  async sendOtp(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res, '/api/otp/send');
  }

  @Post('otp/*')
  @Public()
  @ApiOperation({ summary: 'Generic OTP sub-routes (verify, resend …)' })
  async otpWildcard(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyToService(req, res, '/api/v1/otp', '/api/otp');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Proxy with an explicit, fixed target path (no path rewriting needed).
   * Use this for root-level routes such as POST /notifications.
   */
  private async proxyRequest(req: Request, res: Response, targetPath: string): Promise<void> {
    const correlationId = this.correlationId(req);
    const user = (req as any).user;
    const userId = user?.userId ?? user?.sub;

    try {
      const response = await this.httpProxyService.proxyRequest('NOTIFICATION', {
        method: req.method,
        url: targetPath,
        headers: this.extractHeaders(req),
        body: req.body,
        query: req.query as Record<string, any>,
        correlationId,
        userId,
        role: user?.role,
        tenantId: user?.tenantId,
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      this.handleError(res, error, correlationId);
    }
  }

  /**
   * Proxy with dynamic path rewriting.
   * Strips the gateway prefix and prepends the service prefix.
   *
   * Example:
   *   gateway path : /api/v1/notifications/abc123
   *   gatewayBase  : /api/v1/notifications
   *   serviceBase  : /api/notifications
   *   → service path: /api/notifications/abc123
   */
  private async proxyToService(
    req: Request,
    res: Response,
    gatewayBase: string,
    serviceBase: string,
  ): Promise<void> {
    const correlationId = this.correlationId(req);
    const rawUrl = (req as any).originalUrl || req.url || '';
    const incomingPath = rawUrl.split('?')[0];
    const suffix = incomingPath.replace(new RegExp(`^${gatewayBase}`), '') || '/';
    const targetPath = `${serviceBase}${suffix}`.replace('//', '/');

    const user = (req as any).user;
    const userId = user?.userId ?? user?.sub;

    try {
      const response = await this.httpProxyService.proxyRequest('NOTIFICATION', {
        method: req.method,
        url: targetPath,
        headers: this.extractHeaders(req),
        body: req.body,
        query: req.query as Record<string, any>,
        correlationId,
        userId,
        role: user?.role,
        tenantId: user?.tenantId,
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      this.handleError(res, error, correlationId);
    }
  }

  private correlationId(req: Request): string {
    return (
      (req.headers['x-correlation-id'] as string) ||
      ((req as any).id as string) ||
      `req-${Date.now()}`
    );
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

  private handleError(res: Response, error: any, correlationId: string): void {
    const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({
      error: {
        code: 'PROXY_ERROR',
        message: error.message || 'Internal server error',
        correlationId,
        ...(error?.data && { details: error.data }),
      },
    });
  }
}
