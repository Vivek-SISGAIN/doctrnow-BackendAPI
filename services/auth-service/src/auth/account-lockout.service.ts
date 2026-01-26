import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Account Lockout Service
 * Handles account lockout after failed login attempts
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if account is locked
   */
  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true },
    });

    if (!user || !user.lockedUntil) {
      return false;
    }

    // Check if lockout has expired
    if (user.lockedUntil < new Date()) {
      // Unlock account
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: null,
          failedLoginAttempts: 0,
        },
      });
      return false;
    }

    return true;
  }

  /**
   * Record failed login attempt
   */
  async recordFailedAttempt(userId: string): Promise<{ locked: boolean; lockoutUntil?: Date }> {
    const maxAttempts = this.configService.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    const lockoutDuration = this.configService.get<number>('LOCKOUT_DURATION_MINUTES', 30);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true },
    });

    if (!user) {
      return { locked: false };
    }

    const newAttemptCount = user.failedLoginAttempts + 1;

    if (newAttemptCount >= maxAttempts) {
      // Lock account
      const lockoutUntil = new Date();
      lockoutUntil.setMinutes(lockoutUntil.getMinutes() + lockoutDuration);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: newAttemptCount,
          lockedUntil: lockoutUntil,
        },
      });

      this.logger.warn(`Account locked for user ${userId} until ${lockoutUntil.toISOString()}`);

      return { locked: true, lockoutUntil };
    }

    // Increment attempt count
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: newAttemptCount,
      },
    });

    return { locked: false };
  }

  /**
   * Reset failed login attempts (on successful login)
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }
}

