import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

/**
 * Agora RTC token generation.
 * GET /api/v1/agora/token?channel=CHANNEL_NAME&uid=OPTIONAL_UID
 * Returns { token, appId, channel, uid, expiresAt }.
 * Requires JWT. Use channel name that doctor and patient agree on (e.g. appointmentId).
 */
@ApiTags('agora')
@ApiBearerAuth('JWT-auth')
@Controller('agora')
@UseGuards(JwtAuthGuard)
export class AgoraController {
  constructor(private readonly configService: ConfigService) {}

  @Get('token')
  @ApiQuery({ name: 'channel', required: true, description: 'Agora channel name (e.g. appointment id or consult-xxx)' })
  @ApiQuery({ name: 'uid', required: false, description: 'Optional numeric uid (1–2^32-1). Default: 0 (server assigns)' })
  getRtcToken(
    @Query('channel') channel: string,
    @Query('uid') uidStr?: string,
    @Req() req?: Request,
  ): { token: string; appId: string; channel: string; uid: number; expiresAt: number } {
    const appId = this.configService.get<string>('AGORA_APP_ID');
    const appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE');

    if (!appId || !appCertificate) {
      throw new BadRequestException(
        'Agora token server is not configured. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE to doctrnow-BackendAPI/api-gateway/.env (get them from https://console.agora.io), then restart the API Gateway.',
      );
    }

    const channelName = (channel || '').trim();
    if (!channelName || channelName.length > 64) {
      throw new BadRequestException('Query "channel" is required and must be 1–64 characters.');
    }

    let uid = 0;
    if (uidStr !== undefined && uidStr !== '') {
      const parsed = parseInt(uidStr, 10);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xffffffff) {
        throw new BadRequestException('Query "uid" must be a number between 0 and 2^32-1.');
      }
      uid = parsed;
    }

    const role = RtcRole.PUBLISHER;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs,
    );

    return {
      token,
      appId,
      channel: channelName,
      uid,
      expiresAt: privilegeExpiredTs,
    };
  }
}
