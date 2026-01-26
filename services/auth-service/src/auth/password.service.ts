import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as argon2 from 'argon2';

/**
 * Password Service
 * Handles password hashing, validation, and policies
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly useArgon2: boolean;

  constructor(private readonly configService: ConfigService) {
    // Use Argon2 if available, fallback to bcrypt
    this.useArgon2 = this.configService.get<string>('PASSWORD_HASH_ALGORITHM', 'bcrypt') === 'argon2';
  }

  /**
   * Hash password
   */
  async hashPassword(password: string): Promise<string> {
    if (this.useArgon2) {
      return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 4,
      });
    }

    const rounds = this.configService.get<number>('PASSWORD_HASH_ROUNDS', 12);
    return bcrypt.hash(password, rounds);
  }

  /**
   * Verify password
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      if (this.useArgon2) {
        return argon2.verify(hash, password);
      }
      return bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Validate password against policy
   */
  validatePasswordPolicy(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const minLength = this.configService.get<number>('PASSWORD_MIN_LENGTH', 8);
    const requireUppercase = this.configService.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true);
    const requireLowercase = this.configService.get<boolean>('PASSWORD_REQUIRE_LOWERCASE', true);
    const requireNumber = this.configService.get<boolean>('PASSWORD_REQUIRE_NUMBER', true);
    const requireSpecial = this.configService.get<boolean>('PASSWORD_REQUIRE_SPECIAL', false);

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (requireNumber && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

