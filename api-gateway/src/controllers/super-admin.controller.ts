import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Super Admin Controller
 * Routes: /api/v1/super-admins/*
 * Target: super-admin-service
 * Access: SUPER_ADMIN only
 */
@ApiTags('super-admin')
@ApiBearerAuth('JWT-auth')
@Controller('super-admins')
@UseGuards(JwtAuthGuard)
@SkipThrottle() // We handle rate limiting at the service level, so skip global throttling here
export class SuperAdminController {
  constructor(private readonly httpProxyService: HttpProxyService) { }

  /** Base path: /api/v1/super-admins */
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PATIENT)
  async proxyBaseGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  async proxyBasePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Put()
  @Roles(UserRole.SUPER_ADMIN)
  async proxyBasePut(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  async proxyBasePatch(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Delete()
  @Roles(UserRole.SUPER_ADMIN)
  async proxyBaseDelete(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /** Subpaths: /api/v1/super-admins/* */
  @Get('*')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PATIENT)
  async proxyRequestGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Post('*')
  @Roles(UserRole.SUPER_ADMIN)
  async proxyRequestPost(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Put('*')
  @Roles(UserRole.SUPER_ADMIN)
  async proxyRequestPut(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Patch('*')
  @Roles(UserRole.SUPER_ADMIN)
  async proxyRequestPatch(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Delete('*')
  @Roles(UserRole.SUPER_ADMIN)
  async proxyRequestDelete(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  private async proxyRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      ((req as any).id as string) ||
      `req-${Date.now()}`;
    const rawUrl = (req as any).originalUrl || req.url || '';
    const incomingPath = rawUrl.split('?')[0];
    // Gateway: /api/v1/super-admins/* -> Service: /api/super-admins/*
    const pathSuffix = incomingPath.replace(/^\/api\/v1\/super-admins/, '') || '/';
    const path = `/api/super-admins${pathSuffix}`.replace('//', '/');
    const user = (req as any).user;
    const userId = user?.userId ?? user?.sub;

    try {
      const response = await this.httpProxyService.proxyRequest('SUPER_ADMIN', {
        method: req.method,
        url: path,
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
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({
        error: {
          code: 'PROXY_ERROR THis one',
          message: error.message || 'Internal server error',
          correlationId,
          ...(error?.data && { details: error.data }),
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
