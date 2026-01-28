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
import { UserRole, UserStatus } from '@prisma/client';

export interface RegisterDto {
  email: string;
  mobile?: string;
  password: string;
  role: UserRole;
  tenantId: string;
}

export interface LoginDto {
  email: string;
  password: string;
  tenantId: string;
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
        tenantId: dto.tenantId,
        status: UserStatus.PENDING_VERIFICATION,
      },
    });

    // Publish event
    await this.eventsService.publishUserRegistered({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
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
  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      id: string;
      email: string;
      role: string;
      tenantId: string;
    };
  }> {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Publish failed login event
      await this.eventsService.publishLoginFailed({
        email: dto.email,
        reason: 'User not found',
        tenantId: dto.tenantId,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Check tenant match
    if (user.tenantId !== dto.tenantId) {
      throw new UnauthorizedException('Invalid tenant');
    }

    // Check account lockout
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id);
    if (isLocked) {
      await this.eventsService.publishAccountLocked({
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
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
        tenantId: user.tenantId,
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
      tenantId: user.tenantId,
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    // Publish successful login event
    await this.eventsService.publishLoginSucceeded({
      userId: user.id,
      email: user.email,
      sessionId: session.sessionId,
      tenantId: user.tenantId,
    });

    this.logger.log(`User logged in: ${user.id} (${user.email})`);

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
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
}

