import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createHash } from 'crypto';
import { OtpPurpose } from '@prisma/client';
import { SessionService } from 'src/auth/session.service';

export interface SendOtpDto {
  email?: string;
  mobile?: string;
  purpose: OtpPurpose;
}

export interface VerifyOtpDto {
  email?: string;
  mobile?: string;
  otp: string;
  purpose: OtpPurpose;
  tenantId: string;
}

/**
 * OTP Service
 * Handles OTP generation, hashing, and verification
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
  ) {}

  private normalizeMobile(mobile?: string): string | undefined {
    if (!mobile) return undefined;
    const trimmed = mobile.trim();
    if (!trimmed) return undefined;

    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return undefined;

    return trimmed.startsWith('+') ? `+${digits}` : digits;
  }

  private buildMobileVariants(mobile?: string): string[] {
    const normalized = this.normalizeMobile(mobile);
    if (!normalized) return [];

    const digits = normalized.replace(/\D/g, '');
    return Array.from(new Set([normalized, digits, `+${digits}`]));
  }

  private async findUserByMobile(mobile?: string) {
    const mobileVariants = this.buildMobileVariants(mobile);
    if (mobileVariants.length === 0) {
      return null;
    }

    return this.prisma.user.findFirst({
      where: {
        mobile: {
          in: mobileVariants,
        },
      },
    });
  }

  /**
   * Generate OTP code
   */
  private generateOtp(): string {
    const length = this.configService.get<number>('OTP_LENGTH', 6);
    const digits = '0123456789';
    let otp = '';

    for (let i = 0; i < length; i++) {
      otp += digits.charAt(Math.floor(Math.random() * digits.length));
    }

    return otp;
  }

  /**
   * Hash OTP for storage (SHA-256)
   */
  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Send OTP
   */
  async sendOtp(dto: SendOtpDto): Promise<{ message: string }> {
    const normalizedMobile = this.normalizeMobile(dto.mobile);

    if (!dto.email && !normalizedMobile) {
      throw new BadRequestException('Either email or mobile must be provided');
    }

    // Find user if exists
    let user = null;
    if (dto.email) {
      user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
    } else if (normalizedMobile) {
      user = await this.findUserByMobile(normalizedMobile);
    }

    // Generate OTP
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);

    const ttl = this.configService.get<number>('OTP_TTL_SECONDS', 300); // 5 minutes
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + ttl);

    // Store OTP request (store identifier for lookup when userId is null, e.g. registration)
    await this.prisma.otpRequest.create({
      data: {
        userId: user?.id,
        otpHash,
        purpose: dto.purpose,
        expiresAt,
        identifierEmail: dto.email ?? undefined,
        identifierMobile: normalizedMobile ?? undefined,
      },
    });

    // Dispatch OTP delivery via notification-service → RabbitMQ → worker
    await this.dispatchOtpViaNotificationService({
      otp,
      email: dto.email,
      mobile: dto.mobile,
      userName: user ? ((user as any).name ?? 'User') : 'User',
    });

    // Publish event
    // await this.eventsService.publishOtpSent({
    //   userId: user?.id,
    //   email: dto.email,
    //   mobile: normalizedMobile,
    //   otp,
    //   channel: dto.email ? 'EMAIL' : 'SMS',
    //   purpose: dto.purpose,
    // });

    return {
      message: 'OTP sent successfully',
    };
  }

  /**
   * Verify OTP
   * For testing: OTP "111111" is accepted when ACCEPT_TEST_OTP=true (env).
   * - REGISTRATION: returns verified, userId undefined.
   * - LOGIN: looks up user by mobile/email and returns userId so login/otp can issue tokens.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean; userId?: string; accessToken?: string; refreshToken?: string; expiresIn?: number; sessionId?: string; user?: any }> {
    const normalizedMobile = this.normalizeMobile(dto.mobile);

    if (!dto.email && !normalizedMobile) {
      throw new BadRequestException('Either email or mobile must be provided');
    }

    const acceptTestOtp = this.configService.get<string>('ACCEPT_TEST_OTP', 'true') === 'true';
    if (acceptTestOtp && dto.otp === '111111') {
      if (dto.purpose === 'REGISTRATION') {
        this.logger.warn('Accepting test OTP 111111 for REGISTRATION (ACCEPT_TEST_OTP=true)');
        return { verified: true, userId: undefined };
      }
      if (dto.purpose === 'LOGIN') {
        let user = null;
        if (normalizedMobile) {
          user = await this.findUserByMobile(normalizedMobile);
        } else if (dto.email) {
          user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        }
        this.logger.warn(
          `Accepting test OTP 111111 for LOGIN (ACCEPT_TEST_OTP=true), userId=${user?.id ?? 'none'}`,
        );
        return { verified: true, userId: user?.id ?? undefined };
      }
    }

    const otpHash = this.hashOtp(dto.otp);

    // Find OTP request: by user relation (login) or by identifier email/mobile (registration)
    const otpRequest = await this.prisma.otpRequest.findFirst({
      where: {
        otpHash,
        purpose: dto.purpose,
        verified: false,
        expiresAt: {
          gt: new Date(),
        },
        OR: [
          ...(dto.email ? [{ identifierEmail: dto.email }] : []),
          ...(normalizedMobile ? [{ identifierMobile: normalizedMobile }] : []),
        ].filter(Boolean),
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRequest) {
      throw new NotFoundException('Invalid or expired OTP');
    }

    const maxAttempts = this.configService.get<number>('OTP_MAX_ATTEMPTS', 3);
    if (otpRequest.attemptCount >= maxAttempts) {
      throw new BadRequestException('Maximum OTP verification attempts exceeded');
    }

    // Mark as verified
    await this.prisma.otpRequest.update({
      where: { id: otpRequest.id },
      data: {
        verified: true,
        attemptCount: otpRequest.attemptCount + 1,
      },
    });

    // Publish event
    await this.eventsService.publishOtpVerified({
      userId: otpRequest.userId || undefined,
      email: dto.email,
      mobile: normalizedMobile,
      purpose: dto.purpose,
    });

    if (dto.purpose === 'LOGIN' && otpRequest.userId && otpRequest.user) {
      const user = otpRequest.user;
      if (user.status !== 'ACTIVE') {
        throw new BadRequestException('User account is not active');
      }
      const session = await this.sessionService.createSession({
        userId: user.id,
        tenantId: user.tenantId || "default",
      });
      return {
        verified: true,
        ...session,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        }
      };
    }

    if (dto.purpose === 'LOGIN') {
      throw new NotFoundException('No user found for this mobile number');
    }

    return {
      verified: true,
      userId: otpRequest.userId || undefined,
    };
  }

  /**
   * Dispatch OTP to the user via the notification-service HTTP endpoint.
   * The notification-service enqueues the message in RabbitMQ; the worker
   * delivers it via SMS or Email.
   */
  private async dispatchOtpViaNotificationService(payload: {
    otp: string;
    email?: string;
    mobile?: string;
    userName?: string;
  }): Promise<void> {
    // const baseUrl = this.configService.get<string>(
    //   'NOTIFICATION_SERVICE_URL',
    //   'http://localhost:4000',
    // );
    const baseUrl = process.env.BASE_URL || 'http://localhost:8080';


    const channel = payload.mobile ? 'SMS' : 'EMAIL';
    console.log("Working" , channel , payload.mobile , payload.email);
    try {
      const response = await fetch(`${baseUrl}/api/v1/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp: payload.otp,
          channel,
          mobile: payload.mobile,
          email: payload.email,
          userName: payload.userName ?? 'User',
          eventType: 'OtpSent',
          timestamp: new Date().toISOString(),
        }),
      });

      console.log("Response" , response)
      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`[OtpService] Notification service error ${response.status}: ${body}`);
      } else {
        this.logger.log(
          `[OtpService] OTP dispatched via notification-service (channel: ${channel})`,
        );
      }
    } catch (error) {
      // Non-fatal: OTP is already stored in DB. Log and continue.
      this.logger.error(
        '[OtpService] Failed to reach notification-service — OTP stored but not delivered:',
        error,
      );
    }
  }
}
