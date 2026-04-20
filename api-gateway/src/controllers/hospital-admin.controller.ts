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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { HttpProxyService } from '../http-proxy/http-proxy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Hospital Admin Controller
 * Routes: /api/v1/hospital/*
 * Target: hospital-admin-service (health-services, health-packages, doctors, health)
 * Access: Authenticated users only
 */
@ApiTags('hospital-admin')
@ApiBearerAuth('JWT-auth')
@Controller('hospital')
@SkipThrottle() // We handle rate limiting at the service level, so skip global throttling here
@UseGuards(JwtAuthGuard)
export class HospitalAdminController {
  constructor(private readonly httpProxyService: HttpProxyService) {}

  /** Base path: GET /api/v1/hospital, GET /api/v1/hospital/health, etc. */
  @Get()
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyBaseGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Post()
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyBasePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Put()
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyBasePut(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Patch()
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyBasePatch(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Delete()
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyBaseDelete(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  /** Subpaths: /api/v1/hospital/health-services, /api/v1/hospital/doctors, etc. */
  @Get('*')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyRequestGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Post('*')
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyRequestPost(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Put('*')
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyRequestPut(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Patch('*')
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async proxyRequestPatch(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.proxyRequest(req, res);
  }

  @Delete('*')
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
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
    // Gateway: /api/v1/hospital/* -> Service: /api/* (e.g. /api/health-services, /api/doctors)
    const pathSuffix = incomingPath.replace(/^\/api\/v1\/hospital/, '') || '/';
    const path = `/api${pathSuffix}`.replace('//', '/') || '/api';
    const user = (req as any).user;
    const userId = user?.userId ?? user?.sub;

    try {
      const isMultipart = req.headers['content-type']?.startsWith('multipart/');
      const response = await this.httpProxyService.proxyRequest('HOSPITAL_ADMIN', {
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
