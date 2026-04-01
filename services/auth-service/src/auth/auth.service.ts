import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AccountLockoutService } from './account-lockout.service';
import { EventsService } from '../events/events.service';
import { OtpService } from '../otp/otp.service';
import { UserRole, UserStatus, OtpPurpose } from '@prisma/client';

/** Roles that are permitted to authenticate via OTP */
const OTP_ALLOWED_ROLES: UserRole[] = [UserRole.DOCTOR, UserRole.PATIENT];

export interface RegisterDto {
  email: string;
  mobile?: string;
  password: string;
  role: UserRole;
  tenantId?: string;
}

export interface LoginDto {
  email: string;
  password: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Authentication Service
 * Core authentication business logic
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly accountLockoutService: AccountLockoutService,
    private readonly eventsService: EventsService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Register new user
   */
  async register(dto: RegisterDto): Promise<{
    userId: string;
    email: string;
    role: string;
    status: string;
  }> {
    // Validate password is a string
    if (!dto.password || typeof dto.password !== 'string') {
      throw new BadRequestException('Password must be a non-empty string');
    }
  
    // Validate password policy
    const passwordValidation = this.passwordService.validatePasswordPolicy(dto.password);
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors,
      });
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, ...(dto.mobile ? [{ mobile: dto.mobile }] : [])],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or mobile already exists');
    }

    // Hash password
    this.logger.debug(`Hashing password for user: ${dto.email}`);
    const passwordHash = await this.passwordService.hashPassword(dto.password);
    this.logger.debug('Password hashed successfully');

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        mobile: dto.mobile,
        passwordHash,
        role: dto.role,
        status: UserStatus.ACTIVE,
      },
    });

    // Publish event
    await this.eventsService.publishUserRegistered({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    this.logger.log(`User registered: ${user.id} (${user.email})`);

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  /**
   * Login user
   */
  async login(dto: LoginDto): Promise<
    | {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
          id: string;
          email: string;
          role: string;
        };
      }
    | { message?: string }
  > {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Publish failed login event
      await this.eventsService.publishLoginFailed({
        email: dto.email,
        reason: 'User not found',
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Check tenant match
    // if (user.tenantId !== dto.tenantId) {
    //   throw new UnauthorizedException('Invalid tenant');
    // }

    // Check account lockout
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id);
    if (isLocked) {
      await this.eventsService.publishAccountLocked({
        userId: user.id,
        email: user.email,
      });

      throw new UnauthorizedException('Account is locked due to too many failed login attempts');
    }

    // Verify password
    const passwordValid = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      // Record failed attempt
      await this.accountLockoutService.recordFailedAttempt(user.id);

      // Publish failed login event
      await this.eventsService.publishLoginFailed({
        email: dto.email,
        userId: user.id,
        reason: 'Invalid password',
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    // Reset failed attempts on successful login
    await this.accountLockoutService.resetFailedAttempts(user.id);

    // Create session
    const session = await this.sessionService.createSession({
      userId: user.id,
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    // Publish successful login event
    await this.eventsService.publishLoginSucceeded({
      userId: user.id,
      email: user.email,
      sessionId: session.sessionId,
    });

    this.logger.log(`User logged in: ${user.id} (${user.email})`);

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Login by OTP (phone): verify OTP then create session and return tokens
   */
  async loginByOtp(dto: {
    mobile?: string; // optional
    email?: string; // add this
    otp: string;
    tenantId: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    if (!dto.mobile && !dto.email) {
      throw new BadRequestException('Either mobile or email must be provided');
    }
    const result = await this.otpService.verifyOtp({
      mobile: dto.mobile,
      email: dto.email,
      otp: dto.otp,
      purpose: OtpPurpose.LOGIN,
    });
    if (!result.verified || !result.userId) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Only DOCTOR and PATIENT may authenticate via OTP
    if (!OTP_ALLOWED_ROLES.includes(user.role)) {
      throw new UnauthorizedException('OTP login is only available for DOCTOR and PATIENT roles');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    const session = await this.sessionService.createSession({
      userId: user.id,
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    await this.eventsService.publishLoginSucceeded({
      userId: user.id,
      email: user.email,
      sessionId: session.sessionId,
    });

    this.logger.log(`User logged in by OTP: ${user.id} (${user.email})`);

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      return await this.sessionService.refreshAccessToken(refreshToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Logout (revoke session)
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    await this.sessionService.revokeSession(sessionId);

    await this.eventsService.publishSessionRevoked({
      userId,
      sessionId,
    });

    this.logger.log(`User logged out: ${userId} (session: ${sessionId})`);
  }

  /**
   * Logout all sessions
   */
  async logoutAll(userId: string): Promise<{ revokedCount: number }> {
    const revokedCount = await this.sessionService.revokeAllUserSessions(userId);

    await this.eventsService.publishSessionRevoked({
      userId,
      sessionId: 'all',
    });

    this.logger.log(`All sessions revoked for user: ${userId} (${revokedCount} sessions)`);

    return { revokedCount };
  }

  /**
   * Delete user (soft delete)
   */
  async hardDeleteUser(userId: string): Promise<{ success: true }> {
    // 1. Check user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // 2. Revoke all active sessions
    await this.sessionService.revokeAllUserSessions(userId);

    // 3. Delete dependent records (if not using CASCADE)
    // Example (adjust based on your schema):
    await this.prisma.session.deleteMany({
      where: { userId },
    });

    // 4. Hard delete user
    await this.prisma.user.delete({
      where: { id: userId },
    });

    this.logger.warn(`User HARD deleted: ${userId} (${user.email})`);

    return { success: true };
  }

  async updateUserStatus(
    userId: string,
    status: UserStatus,
  ): Promise<{ userId: string; status: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    this.logger.log(`User ${userId} status updated to ${status}`);

    return { userId: updated.id, status: updated.status };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        mobile: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
  }

  // /**
  //  * Step 1 of OTP registration: validate role, check uniqueness, send OTP.
  //  * Only DOCTOR and PATIENT are permitted.
  //  */
  // async requestRegisterOtp(dto: {
  //   mobile?: string;
  //   email?: string;
  //   role: UserRole;
  //   tenantId: string;
  // }): Promise<{ message: string }> {
  //   if (!OTP_ALLOWED_ROLES.includes(dto.role)) {
  //     throw new BadRequestException(
  //       'OTP registration is only available for DOCTOR and PATIENT roles',
  //     );
  //   }

  //   if (!dto.mobile && !dto.email) {
  //     throw new BadRequestException('Either mobile or email must be provided');
  //   }

  //   // Early uniqueness check
  //   const existing = await this.prisma.user.findFirst({
  //     where: {
  //       OR: [
  //         ...(dto.email ? [{ email: dto.email }] : []),
  //         ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
  //       ],
  //     },
  //   });

  //   if (existing) {
  //     throw new ConflictException('User with this email or mobile already exists');
  //   }

  //   return this.otpService.sendOtp({
  //     email: dto.email,
  //     mobile: dto.mobile,
  //     purpose: OtpPurpose.REGISTRATION,
  //     tenantId: dto.tenantId,
  //   });
  // }

  // /**
  //  * Step 2 of OTP registration: verify OTP, create user (no password),
  //  * open a session, and return tokens — same shape as a normal login response.
  //  */
  // async registerByOtp(dto: {
  //   mobile?: string;
  //   email?: string;
  //   otp: string;
  //   role: UserRole;
  //   tenantId: string;
  //   deviceId?: string;
  //   ipAddress?: string;
  //   userAgent?: string;
  // }): Promise<{
  //   accessToken: string;
  //   refreshToken: string;
  //   expiresIn: number;
  //   user: { id: string; email: string; role: string; tenantId: string };
  // }> {
  //   if (!OTP_ALLOWED_ROLES.includes(dto.role)) {
  //     throw new BadRequestException(
  //       'OTP registration is only available for DOCTOR and PATIENT roles',
  //     );
  //   }

  //   if (!dto.mobile && !dto.email) {
  //     throw new BadRequestException('Either mobile or email must be provided');
  //   }

  //   // Verify OTP
  //   const result = await this.otpService.verifyOtp({
  //     mobile: dto.mobile,
  //     email: dto.email,
  //     otp: dto.otp,
  //     purpose: OtpPurpose.REGISTRATION,
  //     tenantId: dto.tenantId,
  //   });

  //   if (!result.verified) {
  //     throw new UnauthorizedException('Invalid or expired OTP');
  //   }

  //   // Race-condition guard: re-check uniqueness before insert
  //   const existing = await this.prisma.user.findFirst({
  //     where: {
  //       OR: [
  //         ...(dto.email ? [{ email: dto.email }] : []),
  //         ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
  //       ],
  //     },
  //   });

  //   if (existing) {
  //     throw new ConflictException('User with this email or mobile already exists');
  //   }

  //   // OTP users have no password — store an unknowable random hash
  //   const randomPassword = randomBytes(32).toString('hex');
  //   const passwordHash = await this.passwordService.hashPassword(randomPassword);

  //   // Email is required by the DB schema; generate a placeholder when omitted
  //   const email = dto.email ?? `otp-${randomBytes(8).toString('hex')}@placeholder.doctornow.local`;

  //   const user = await this.prisma.user.create({
  //     data: {
  //       email,
  //       mobile: dto.mobile,
  //       passwordHash,
  //       role: dto.role,
  //       tenantId: dto.tenantId,
  //       status: UserStatus.ACTIVE,
  //     },
  //   });

  //   await this.eventsService.publishUserRegistered({
  //     userId: user.id,
  //     email: user.email,
  //     role: user.role,
  //     tenantId: user.tenantId,
  //   });

  //   const session = await this.sessionService.createSession({
  //     userId: user.id,
  //     tenantId: user.tenantId,
  //     deviceId: dto.deviceId,
  //     ipAddress: dto.ipAddress,
  //     userAgent: dto.userAgent,
  //   });

  //   await this.eventsService.publishLoginSucceeded({
  //     userId: user.id,
  //     email: user.email,
  //     sessionId: session.sessionId,
  //     tenantId: user.tenantId,
  //   });

  //   this.logger.log(`User registered via OTP: ${user.id} (${user.email})`);

  //   return {
  //     ...session,
  //     user: {
  //       id: user.id,
  //       email: user.email,
  //       role: user.role,
  //       tenantId: user.tenantId,
  //     },
  //   };
  // }

  // async requestLoginOtp(dto: {
  //   mobile?: string;
  //   email?: string;
  //   tenantId: string;
  // }): Promise<{ message: string }> {
  //   if (!dto.mobile && !dto.email) {
  //     throw new BadRequestException('Either mobile or email must be provided');
  //   }

  //   // Verify user exists and is an allowed role before sending OTP
  //   const user = await this.prisma.user.findFirst({
  //     where: {
  //       OR: [
  //         ...(dto.email ? [{ email: dto.email }] : []),
  //         ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
  //       ],
  //     },
  //   });

  //   if (!user) {
  //     // Return generic message to avoid user enumeration
  //     return { message: 'If an account exists, an OTP has been sent' };
  //   }

  //   if (!OTP_ALLOWED_ROLES.includes(user.role)) {
  //     throw new UnauthorizedException('OTP login is only available for DOCTOR and PATIENT roles');
  //   }

  //   if (user.status !== UserStatus.ACTIVE) {
  //     throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
  //   }

  //   return this.otpService.sendOtp({
  //     email: dto.email,
  //     mobile: dto.mobile,
  //     purpose: OtpPurpose.LOGIN,
  //     tenantId: dto.tenantId,
  //   });
  // }

  /**
   * Unified OTP send:
   * - MOBILE (LOGIN): user exists, is DOCTOR/PATIENT, is ACTIVE → send OTP
   * - EMAIL+PASSWORD (LOGIN): validate credentials first, then send OTP
   * - REGISTRATION: user must NOT exist, role must be DOCTOR or PATIENT
   */
  async sendOtp(dto: {
    mobile?: string;
    email?: string;
    password?: string; // only for email+password login flow
    purpose: OtpPurpose;
    role?: UserRole;
  }): Promise<{ message: string }> {
    if (!dto.mobile && !dto.email) {
      throw new BadRequestException('Either mobile or email must be provided');
    }

    // ── REGISTRATION ────────────────────────────────────────────────────────
    if (dto.purpose === OtpPurpose.REGISTRATION) {
      if (!dto.role || !OTP_ALLOWED_ROLES.includes(dto.role)) {
        throw new BadRequestException(
          'role is required for registration and must be DOCTOR or PATIENT',
        );
      }

      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(dto.email ? [{ email: dto.email }] : []),
            ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
          ],
        },
      });

      if (existing) {
        throw new ConflictException('User with this email or mobile already exists');
      }

      return this.otpService.sendOtp({
        email: dto.email,
        mobile: dto.mobile,
        purpose: dto.purpose,
      });
    }

    // ── LOGIN ────────────────────────────────────────────────────────────────
    if (dto.purpose === OtpPurpose.LOGIN) {
      // EMAIL + PASSWORD flow → validate credentials before sending OTP
      if (dto.email && dto.password) {
        const user = await this.prisma.user.findUnique({
          where: { email: dto.email },
        });

        // Generic error to avoid user enumeration
        if (!user) {
          throw new UnauthorizedException('Invalid credentials');
        }

        if (!OTP_ALLOWED_ROLES.includes(user.role)) {
          throw new UnauthorizedException(
            'OTP login is only available for DOCTOR and PATIENT roles',
          );
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
        }

        // Check account lockout
        const isLocked = await this.accountLockoutService.isAccountLocked(user.id);
        if (isLocked) {
          await this.eventsService.publishAccountLocked({ userId: user.id, email: user.email });
          throw new UnauthorizedException(
            'Account is locked due to too many failed login attempts',
          );
        }

        // Validate password
        const passwordValid = await this.passwordService.verifyPassword(
          dto.password,
          user.passwordHash,
        );
        if (!passwordValid) {
          await this.accountLockoutService.recordFailedAttempt(user.id);
          await this.eventsService.publishLoginFailed({
            email: dto.email,
            userId: user.id,
            reason: 'Invalid password',
          });
          throw new UnauthorizedException('Invalid credentials');
        }

        // Reset failed attempts after successful password check
        await this.accountLockoutService.resetFailedAttempts(user.id);

        // Send OTP to their registered email
        return this.otpService.sendOtp({
          email: user.email,
          purpose: OtpPurpose.LOGIN,
        });
      }

      // MOBILE flow → just check user exists, role, and status
      if (dto.mobile) {
        const user = await this.prisma.user.findFirst({
          where: { mobile: dto.mobile },
        });

        // Generic message to avoid user enumeration
        if (!user) {
          return { message: 'If an account exists, an OTP has been sent' };
        }

        if (!OTP_ALLOWED_ROLES.includes(user.role)) {
          throw new UnauthorizedException(
            'OTP login is only available for DOCTOR and PATIENT roles',
          );
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
        }

        return this.otpService.sendOtp({
          mobile: dto.mobile,
          purpose: OtpPurpose.LOGIN,
        });
      }

      throw new BadRequestException('For LOGIN, provide either mobile or email with password');
    }

    throw new BadRequestException('Invalid OTP purpose');
  }

  /**
   * Unified OTP verify:
   * - LOGIN: verifies OTP → creates session → returns tokens
   * - REGISTRATION: verifies OTP → creates user → creates session → returns tokens
   */
  async verifyOtp(dto: {
    mobile?: string;
    email?: string;
    otp: string;
    role?: UserRole; // required only for REGISTRATION
    tenantId?: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: string; email: string; role: string };
  }> {
    if (!dto.mobile && !dto.email) {
      throw new BadRequestException('Either mobile or email must be provided');
    }

    // Determine purpose: existing user = LOGIN, no user = REGISTRATION
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(dto.email ? [{ email: dto.email }] : []),
          ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
        ],
      },
    });

    const purpose = existingUser ? OtpPurpose.LOGIN : OtpPurpose.REGISTRATION;

    // Verify OTP
    const result = await this.otpService.verifyOtp({
      mobile: dto.mobile,
      email: dto.email,
      otp: dto.otp,
      purpose,
    });

    if (!result.verified) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // ── REGISTRATION PATH ──────────────────────────────────────────────────
    if (purpose === OtpPurpose.REGISTRATION) {
      if (!dto.role || !OTP_ALLOWED_ROLES.includes(dto.role)) {
        throw new BadRequestException(
          'role is required for registration and must be DOCTOR or PATIENT',
        );
      }

      // Race-condition guard
      const duplicate = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(dto.email ? [{ email: dto.email }] : []),
            ...(dto.mobile ? [{ mobile: dto.mobile }] : []),
          ],
        },
      });

      if (duplicate) {
        throw new ConflictException('User with this email or mobile already exists');
      }

      const { randomBytes } = await import('crypto');
      const passwordHash = await this.passwordService.hashPassword(randomBytes(32).toString('hex'));

      const email =
        dto.email ?? `otp-${randomBytes(8).toString('hex')}@placeholder.doctornow.local`;

      const newUser = await this.prisma.user.create({
        data: {
          email,
          mobile: dto.mobile,
          passwordHash,
          role: dto.role,
          tenantId: dto.tenantId,
          status: UserStatus.ACTIVE,
        },
      });

      await this.eventsService.publishUserRegistered({
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
      });

      const session = await this.sessionService.createSession({
        userId: newUser.id,
        deviceId: dto.deviceId,
        ipAddress: dto.ipAddress,
        userAgent: dto.userAgent,
      });

      await this.eventsService.publishLoginSucceeded({
        userId: newUser.id,
        email: newUser.email,
        sessionId: session.sessionId,
      });

      this.logger.log(`User registered via OTP: ${newUser.id} (${newUser.email})`);

      return {
        ...session,
        user: { id: newUser.id, email: newUser.email, role: newUser.role },
      };
    }

    // ── LOGIN PATH ─────────────────────────────────────────────────────────
    if (!existingUser) {
      throw new UnauthorizedException('User not found');
    }

    if (!OTP_ALLOWED_ROLES.includes(existingUser.role)) {
      throw new UnauthorizedException('OTP login is only available for DOCTOR and PATIENT roles');
    }

    if (existingUser.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${existingUser.status.toLowerCase()}`);
    }

    const session = await this.sessionService.createSession({
      userId: existingUser.id,
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    await this.eventsService.publishLoginSucceeded({
      userId: existingUser.id,
      email: existingUser.email,
      sessionId: session.sessionId,
    });

    this.logger.log(`User logged in via OTP: ${existingUser.id} (${existingUser.email})`);

    return {
      ...session,
      user: { id: existingUser.id, email: existingUser.email, role: existingUser.role },
    };
  }
}
