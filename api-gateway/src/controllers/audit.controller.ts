import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditLog } from '../models/AuditLog';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';

@ApiTags('audit')
@ApiBearerAuth('JWT-auth')
@Controller('audit/logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AuditController {
  @Get()
  @ApiOperation({ summary: 'Get paginated audit logs' })
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('path') path?: string,
    @Query('method') method?: string,
    @Query('statusCode') statusCode?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const query: any = {};
    if (userId) query.userId = userId;
    if (path) query.path = new RegExp(path, 'i');
    if (method) query.method = method;
    if (statusCode) query.statusCode = statusCode;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate).toISOString();
      if (endDate) query.timestamp.$lte = new Date(endDate).toISOString();
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limitNum).exec(),
      AuditLog.countDocuments(query).exec()
    ]);

    return {
      data: logs,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      }
    };
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get a single audit log entry by eventId' })
  async getAuditLogById(@Param('eventId') eventId: string) {
    const log = await AuditLog.findOne({ eventId }).exec();
    if (!log) {
      return { message: 'Audit log not found' };
    }
    return log;
  }
}
