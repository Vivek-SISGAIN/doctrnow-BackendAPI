import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AccountLockoutService } from './account-lockout.service';
import { EventsService } from '../events/events.service';
import { OtpService } from '../otp/otp.service';
import { UserRole, UserStatus, OtpPurpose } from '@prisma/client';

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
    private readonly otpService: OtpService,
    private readonly configService: ConfigService,
  ) { }

  private normalizeMobile(mobile?: string): string | undefined {
    if (!mobile) return undefined;
    const trimmed = mobile.trim();
    if (!trimmed) return undefined;

    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return undefined;

    return trimmed.startsWith('+') ? `+${digits}` : digits;
  }

  /**
   * Cross-verify active status for the user in auth-service and, for DOCTOR role,
   * in profile-service via the API Gateway. Normalizes status comparisons case-insensitively.
   * Fails closed on any error, timeout, or missing/inactive record.
   */
  private async verifyDoctorActiveStatus(user: {
    id: string;
    email: string;
    role: UserRole | string;
    status: UserStatus | string;
  }): Promise<void> {
    const authStatus = (user.status || '').toString().trim().toLowerCase();
    if (authStatus !== 'active') {
      this.logger.warn(
        `[Auth] Login rejected: user ${user.id} (${user.email}) auth-service status is '${user.status}' (expected 'active')`,
      );
      throw new UnauthorizedException('Account is inactive');
    }

    if (user.role?.toString().trim().toUpperCase() !== 'DOCTOR') {
      return;
    }

    const apiGatewayUrl =
      this.configService.get<string>('API_GATEWAY_URL') ||
      process.env.API_GATEWAY_URL ||
      process.env.API_GATEWAY ||
      'http://localhost:8080/api/v1';
    const internalSecret =
      this.configService.get<string>('INTERNAL_SERVICE_SECRET') ||
      process.env.INTERNAL_SERVICE_SECRET ||
      'super_secret_internal_key_123';

    const gatewayBase = apiGatewayUrl.replace(/\/+$/, '');

    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      response = await fetch(`${gatewayBase}/profiles/doctors/${user.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service-key': internalSecret,
          'x-internal-secret': internalSecret,
        },
        signal: controller.signal,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      this.logger.error(
        `[Auth] Failed to reach API Gateway to verify doctor status for user ${user.id} (${user.email}): ${error?.message || error}`,
      );
      throw new UnauthorizedException('Unable to verify account status, try again');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 404) {
        this.logger.warn(
          `[Auth] Doctor profile not found via API Gateway for user ${user.id} (${user.email}) (HTTP 404)`,
        );
        throw new UnauthorizedException('Account is inactive');
      }
      this.logger.error(
        `[Auth] API Gateway returned HTTP status ${response.status} when verifying doctor status for user ${user.id}`,
      );
      throw new UnauthorizedException('Unable to verify account status, try again');
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseError: any) {
      this.logger.error(
        `[Auth] Failed to parse API Gateway response for doctor user ${user.id}: ${parseError?.message || parseError}`,
      );
      throw new UnauthorizedException('Unable to verify account status, try again');
    }

    const doctorData = data?.data || data;
    const rawProfileStatus = doctorData?.status;
    const profileStatus = (rawProfileStatus || '').toString().trim().toLowerCase();

    if (profileStatus !== 'active') {
      this.logger.warn(
        `[Auth] Login rejected: doctor ${user.id} (${user.email}) profile status is '${rawProfileStatus}' (expected 'active')`,
      );
      throw new UnauthorizedException('Account is inactive');
    }
  }

  /**
   * Register new user
   */
  async register(dto: RegisterDto): Promise<{
    userId: string;
    email: string;
    role: string;
    status: string;
  }> {
    const normalizedMobile = this.normalizeMobile(dto.mobile);
    console.log("This was executed")
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
        OR: [{ email: dto.email }, ...(normalizedMobile ? [{ mobile: normalizedMobile }] : [])],
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
        mobile: normalizedMobile,
        passwordHash,
        role: dto.role,
        tenantId: dto.tenantId,
        status: UserStatus.ACTIVE,
      },
    });

    // Publish event
    // await this.eventsService.publishUserRegistered({
    //   userId: user.id,
    //   email: user.email,
    //   role: user.role,
    //   tenantId: user.tenantId,
    // });

    this.logger.log(`User registered: ${user.id} (${user.email})`);

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  /**
   * Register new user and immediately issue tokens (for patient registration flow).
   * Calls this.register() internally — no logic duplication.
   * The caller has already verified identity (phone OTP) so 2FA is not re-triggered.
   */
  async registerAndLogin(dto: RegisterDto & {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    sessionId: string;
    user: {
      id: string;
      email: string;
      role: string;
      tenantId: string;
    };
  }> {
    // Step 1: Reuse all registration logic (validation, duplicate check, hash, create user, publish event)
    await this.register(dto);

    // Step 2: Fetch the newly created user to obtain id and tenantId
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('User not found after registration');
    }

    // Step 3: Create session and issue tokens immediately (registration verified identity via OTP)
    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId: user.tenantId || "default",
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    // await this.eventsService.publishLoginSucceeded({
    //   userId: user.id,
    //   email: user.email,
    //   sessionId: session.sessionId,
    //   tenantId: user.tenantId,
    // });

    this.logger.log(`User registered and auto-logged in: ${user.id} (${user.email})`);

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || "default",
      },
    };
  }

  /**
   * Login user
   */
  async login(dto: LoginDto): Promise<{
    requires2fa?: boolean;
    message?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    user?: {
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
      // await this.eventsService.publishLoginFailed({
      //   email: dto.email,
      //   reason: 'User not found',
      //   tenantId: dto.tenantId,
      // });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Check tenant match
    // if (user.tenantId !== dto.tenantId) {
    //   throw new UnauthorizedException('Invalid tenant');
    // }

    // Check account lockout
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id);
    if (isLocked) {
      // await this.eventsService.publishAccountLocked({
      //   userId: user.id,
      //   email: user.email,
      //   tenantId: user.tenantId,
      // });

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
      // await this.eventsService.publishLoginFailed({
      //   email: dto.email,
      //   userId: user.id,
      //   reason: 'Invalid password',
      //   tenantId: user.tenantId || ,
      // });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Cross-verify status across auth-service and profile-service
    await this.verifyDoctorActiveStatus(user);

    // Reset failed attempts on successful login
    await this.accountLockoutService.resetFailedAttempts(user.id);

    // Enforce 2FA for DOCTOR role
    const ROLES_REQUIRING_2FA = ['DOCTOR', 'PATIENT'];
    if (ROLES_REQUIRING_2FA.includes(user.role)) {
      this.logger.log(`User requires 2FA: ${user.id} (${user.email})`);
      return {
        requires2fa: true,
        message: 'Please verify OTP to complete login',
      };
    }

    // Create session
    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId: user.tenantId || "default",
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    // Publish successful login event
    // await this.eventsService.publishLoginSucceeded({
    //   userId: user.id,
    //   email: user.email,
    //   sessionId: session.sessionId,
    //   tenantId: user.tenantId,
    // });

    this.logger.log(`User logged in: ${user.id} (${user.email})`);

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || "default",
      },
    };
  }

  /**
   * Login by OTP (phone): verify OTP then create session and return tokens
   */
  async loginByOtp(dto: {
    mobile: string;
    otp: string;
    tenantId: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
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


    const result = await this.otpService.verifyOtp({
      mobile: dto.mobile,
      otp: dto.otp,
      purpose: OtpPurpose.LOGIN,
      tenantId: dto.tenantId || "default",
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

    // Cross-verify status across auth-service and profile-service
    await this.verifyDoctorActiveStatus(user);

    const session = await this.sessionService.createSession({
      userId: user.id,
      tenantId: user.tenantId || "default",
      deviceId: dto.deviceId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    // await this.eventsService.publishLoginSucceeded({
    //   userId: user.id,
    //   email: user.email,
    //   sessionId: session.sessionId,
    //   tenantId: user.tenantId,
    // });

    this.logger.log(`User logged in by OTP: ${user.id} (${user.email})`);

    return {
      ...session,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || "default",
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
}
