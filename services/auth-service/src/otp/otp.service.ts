import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createHash, randomBytes } from 'crypto';
import { OtpPurpose } from '@prisma/client';

export interface SendOtpDto {
  email?: string;
  mobile?: string;
  purpose: OtpPurpose;
  tenantId: string;
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
  ) {}

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
    if (!dto.email && !dto.mobile) {
      throw new BadRequestException('Either email or mobile must be provided');
    }

    // Find user if exists
    let user = null;
    if (dto.email) {
      user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
    } else if (dto.mobile) {
      user = await this.prisma.user.findFirst({
        where: { mobile: dto.mobile },
      });
    }

    // Generate OTP
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);

    const ttl = this.configService.get<number>('OTP_TTL_SECONDS', 300); // 5 minutes
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + ttl);

    // Store OTP request
    await this.prisma.otpRequest.create({
      data: {
        userId: user?.id,
        tenantId: dto.tenantId,
        otpHash,
        purpose: dto.purpose,
        expiresAt,
      },
    });

    // TODO: Send OTP via SMS/Email service
    // For now, log it (REMOVE IN PRODUCTION - use notification service)
    this.logger.warn(`OTP for ${dto.email || dto.mobile}: ${otp} (DO NOT LOG IN PRODUCTION)`);

    // Publish event
    await this.eventsService.publishOtpSent({
      userId: user?.id,
      email: dto.email,
      mobile: dto.mobile,
      purpose: dto.purpose,
      tenantId: dto.tenantId,
    });

    return {
      message: 'OTP sent successfully',
    };
  }

  /**
   * Verify OTP
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean; userId?: string }> {
    if (!dto.email && !dto.mobile) {
      throw new BadRequestException('Either email or mobile must be provided');
    }

    const otpHash = this.hashOtp(dto.otp);

    // Find OTP request
    const otpRequest = await this.prisma.otpRequest.findFirst({
      where: {
        otpHash,
        purpose: dto.purpose,
        tenantId: dto.tenantId,
        verified: false,
        expiresAt: {
          gt: new Date(),
        },
        ...(dto.email
          ? { user: { email: dto.email } }
          : { user: { mobile: dto.mobile } }),
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
      mobile: dto.mobile,
      purpose: dto.purpose,
      tenantId: dto.tenantId,
    });

    return {
      verified: true,
      userId: otpRequest.userId || undefined,
    };
  }
}

