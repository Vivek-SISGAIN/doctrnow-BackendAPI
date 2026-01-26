import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '../jwt/jwt.service';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSessionData {
  userId: string;
  tenantId: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Session Service
 * Manages user sessions and refresh tokens
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new session
   */
  async createSession(data: CreateSessionData): Promise<{
    sessionId: string;
    refreshToken: string;
    accessToken: string;
    expiresIn: number;
  }> {
    const { token: refreshToken, hash: refreshTokenHash } =
      await this.jwtService.generateRefreshToken();

    const refreshTokenTTL = this.configService.get<number>(
      'JWT_REFRESH_TOKEN_TTL',
      604800,
    ); // 7 days
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + refreshTokenTTL);

    const session = await this.prisma.session.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        refreshTokenHash,
        deviceId: data.deviceId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        expiresAt,
      },
    });

    // Get user role for token
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { role: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const accessToken = await this.jwtService.generateAccessToken(
      data.userId,
      data.tenantId,
      user.role,
      session.id,
    );

    const expiresIn = this.configService.get<number>('JWT_ACCESS_TOKEN_TTL', 900);

    return {
      sessionId: session.id,
      refreshToken,
      accessToken,
      expiresIn,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const refreshTokenHash = this.jwtService.hashToken(refreshToken);

    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            tenantId: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Invalid or expired refresh token');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new Error('User account is not active');
    }

    // Rotate refresh token (generate new, revoke old)
    const { token: newRefreshToken, hash: newRefreshTokenHash } =
      await this.jwtService.generateRefreshToken();

    const refreshTokenTTL = this.configService.get<number>(
      'JWT_REFRESH_TOKEN_TTL',
      604800,
    );
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + refreshTokenTTL);

    // Revoke old session and create new one
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newSession = await this.prisma.session.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId,
        refreshTokenHash: newRefreshTokenHash,
        deviceId: session.deviceId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        expiresAt,
      },
    });

    const accessToken = await this.jwtService.generateAccessToken(
      session.user.id,
      session.user.tenantId,
      session.user.role,
      newSession.id,
    );

    const expiresIn = this.configService.get<number>('JWT_ACCESS_TOKEN_TTL', 900);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
    };
  }

  /**
   * Revoke session (logout)
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }
}

