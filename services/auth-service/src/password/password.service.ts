import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService as PasswordHashService } from '../auth/password.service';
import { EventsService } from '../events/events.service';
import { randomBytes } from 'crypto';

export interface PasswordResetRequestDto {
  email: string;
  tenantId: string;
}

export interface PasswordResetConfirmDto {
  token: string;
  newPassword: string;
}

/**
 * Password Reset Service
 * Handles password reset workflows
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Request password reset
   */
  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if user exists (security best practice)
      return { message: 'If the email exists, a password reset link has been sent' };
    }

    if (user.tenantId !== dto.tenantId) {
      return { message: 'If the email exists, a password reset link has been sent' };
    }

    // Generate reset token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // TODO: Send reset email via notification service
    this.logger.warn(`Password reset token for ${dto.email}: ${token} (DO NOT LOG IN PRODUCTION)`);

    // Publish event
    await this.eventsService.publishPasswordResetRequested({
      userId: user.id,
      email: user.email,
    });

    return { message: 'If the email exists, a password reset link has been sent' };
  }

  /**
   * Confirm password reset
   */
  async confirmPasswordReset(dto: PasswordResetConfirmDto): Promise<{ message: string }> {
    // Validate password policy
    const passwordValidation = this.passwordHashService.validatePasswordPolicy(
      dto.newPassword,
    );
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors,
      });
    }

    // Find reset token
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new NotFoundException('Invalid or expired reset token');
    }

    if (resetToken.used) {
      throw new BadRequestException('Reset token has already been used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash new password
    const passwordHash = await this.passwordHashService.hashPassword(dto.newPassword);

    // Update password and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    // Revoke all sessions (force re-login)
    await this.prisma.session.updateMany({
      where: {
        userId: resetToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Publish event
    await this.eventsService.publishPasswordResetCompleted({
      userId: resetToken.userId,
      email: resetToken.user.email,
    });

    this.logger.log(`Password reset completed for user: ${resetToken.userId}`);

    return { message: 'Password reset successfully' };
  }
}

