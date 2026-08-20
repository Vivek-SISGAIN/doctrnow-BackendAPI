import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditLog } from '../models/AuditLog';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { publishBusinessAuditEvent } from '../services/auditPublisher';
import { SkipThrottle } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

@ApiTags('audit')
@Controller('audit')
@SkipThrottle()
export class AuditController {
  @Get('logs')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get paginated audit logs with scoping and filters' })
  async getAuditLogs(
    @Req() req: any,
    @Query('hospitalId') hospitalId?: string,
    @Query('entityType') entityType?: string,
    @Query('actionType') actionType?: string,
    @Query('actionPerformed') actionPerformed?: string,
    @Query('userId') userId?: string,
    @Query('performedByUserId') performedByUserId?: string,
    @Query('path') path?: string,
    @Query('method') method?: string,
    @Query('statusCode') statusCode?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const query: any = {
      action: { $nin: ['HTTP_REQUEST', 'HTTP_RESPONSE'] },
    };

    let requesterRole = req.user?.role || req.headers['x-user-role'];
    let requesterHospitalId = req.user?.hospitalId || req.user?.tenantId || req.headers['x-hospital-id'] || req.headers['x-tenant-id'];

    if ((!requesterRole || !requesterHospitalId) && req.headers?.authorization) {
      try {
        const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
        const decoded: any = jwt.decode(token);
        if (decoded) {
          requesterRole = requesterRole || decoded.role;
          requesterHospitalId = requesterHospitalId || decoded.hospitalId || decoded.tenantId;
        }
      } catch {}
    }

    if (requesterRole === UserRole.HOSPITAL_ADMIN || requesterRole === 'HOSPITAL_ADMIN') {
      query.hospitalId = requesterHospitalId || '__NONE__';
      if (entityType && ['DOCTOR', 'PATIENT', 'APPOINTMENT'].includes(entityType.toUpperCase())) {
        query.entityType = entityType.toUpperCase();
      } else {
        query.entityType = { $in: ['DOCTOR', 'PATIENT', 'APPOINTMENT'] };
      }
    } else {
      if (hospitalId) {
        query.hospitalId = hospitalId;
      }
      if (entityType && entityType !== 'ALL') {
        query.entityType = entityType.toUpperCase();
      }
    }

    if (actionType) {
      query.actionType = actionType;
    }

    if (actionPerformed) {
      query.actionPerformed = new RegExp(actionPerformed, 'i');
    }

    const effectiveUserId = performedByUserId || userId;
    if (effectiveUserId) {
      query.$or = [
        { userId: effectiveUserId },
        { performedByUserId: effectiveUserId },
      ];
    }

    if (path) {
      query.path = new RegExp(path, 'i');
    }

    if (method) {
      query.method = method.toUpperCase();
    }

    if (statusCode) {
      query.statusCode = Number(statusCode);
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate).toISOString();
      if (endDate) query.timestamp.$lte = new Date(endDate).toISOString();
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        ...(query.$or || []),
        { actionPerformed: searchRegex },
        { performedByRole: searchRegex },
        { remarks: searchRegex },
        { path: searchRegex },
        { action: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    console.log('[AuditController] requesterRole:', requesterRole, 'requesterHospitalId:', requesterHospitalId, 'constructed query:', JSON.stringify(query));

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .exec(),
      AuditLog.countDocuments(query).exec(),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  @Get('logs/:eventId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get a single audit log entry by eventId' })
  async getAuditLogById(@Param('eventId') eventId: string) {
    const log = await AuditLog.findOne({ eventId }).exec();
    if (!log) {
      return { message: 'Audit log not found' };
    }
    return log;
  }

  @Post('events/internal')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Internal ingestion endpoint for business audit events' })
  async ingestInternalAuditEvent(
    @Body() payload: any,
    @Headers('x-internal-service-key') internalKey?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    const expectedSecret =
      process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';
    const providedSecret = internalKey || internalSecret;

    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal service secret');
    }

    if (!payload || !payload.actionPerformed || !payload.timestamp) {
      throw new BadRequestException('actionPerformed and timestamp are required in audit event');
    }

    const savedDoc = await publishBusinessAuditEvent(payload);

    return {
      success: true,
      data: savedDoc,
      message: 'Audit event published successfully',
    };
  }
}
