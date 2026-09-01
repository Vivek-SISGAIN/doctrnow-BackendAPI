import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService, LoginDto } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AccountLockoutService } from './account-lockout.service';
import { EventsService } from '../events/events.service';
import { OtpService } from '../otp/otp.service';

describe('AuthService - Doctor Login Status Cross-Validation', () => {
  let authService: AuthService;
  let prismaService: any;
  let passwordService: any;
  let sessionService: any;
  let accountLockoutService: any;
  let eventsService: any;
  let otpService: any;
  let configService: any;

  const mockDoctorUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'doctor@doctornow.ae',
    passwordHash: 'hashed_password_123',
    role: UserRole.DOCTOR,
    status: UserStatus.ACTIVE,
    tenantId: 'tenant-123',
  };

  const loginDto: LoginDto = {
    email: 'doctor@doctornow.ae',
    password: 'Password123!',
    tenantId: 'tenant-123',
  };

  beforeEach(async () => {
    prismaService = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...mockDoctorUser }),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    passwordService = {
      verifyPassword: jest.fn().mockResolvedValue(true),
      hashPassword: jest.fn().mockResolvedValue('hashed_pw'),
      validatePasswordPolicy: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    };

    sessionService = {
      createSession: jest.fn().mockResolvedValue({
        sessionId: 'sess-123',
        accessToken: 'mock_jwt_token',
        refreshToken: 'mock_refresh_token',
        expiresIn: 900,
      }),
    };

    accountLockoutService = {
      isAccountLocked: jest.fn().mockResolvedValue(false),
      recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
      resetFailedAttempts: jest.fn().mockResolvedValue(undefined),
    };

    eventsService = {
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    otpService = {
      verifyOtp: jest.fn().mockResolvedValue({ verified: true, userId: mockDoctorUser.id }),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'API_GATEWAY_URL') return 'http://localhost:8080/api/v1';
        if (key === 'INTERNAL_SERVICE_SECRET') return 'test_internal_secret';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: PasswordService, useValue: passwordService },
        { provide: SessionService, useValue: sessionService },
        { provide: AccountLockoutService, useValue: accountLockoutService },
        { provide: EventsService, useValue: eventsService },
        { provide: OtpService, useValue: otpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Doctor login status cross-validation', () => {
    it('should succeed when both auth-service and profile-service statuses are ACTIVE', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'doc-uuid-123',
            userId: mockDoctorUser.id,
            status: 'ACTIVE',
          },
        }),
      } as any);

      const result = await authService.login(loginDto);

      expect(result).toBeDefined();
      expect(result.requires2fa).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/profiles/doctors/11111111-1111-1111-1111-111111111111',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-internal-service-key': 'test_internal_secret',
            'x-internal-secret': 'test_internal_secret',
          }),
        }),
      );
      expect(accountLockoutService.resetFailedAttempts).toHaveBeenCalledWith(mockDoctorUser.id);
    });

    it('should treat case-mismatched but semantically active values ("active" vs "ACTIVE") as active (success)', async () => {
      // auth-service has "active" in lowercase or mixed case
      prismaService.user.findUnique.mockResolvedValue({
        ...mockDoctorUser,
        status: 'active' as any,
      });

      // profile-service returns "ACTIVE" in uppercase
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'doc-uuid-123',
            userId: mockDoctorUser.id,
            status: 'ACTIVE',
          },
        }),
      } as any);

      const result = await authService.login(loginDto);
      expect(result.requires2fa).toBe(true);

      // Now reverse: auth-service has "ACTIVE" and profile-service returns "active"
      prismaService.user.findUnique.mockResolvedValue({
        ...mockDoctorUser,
        status: 'ACTIVE' as any,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'doc-uuid-123',
            userId: mockDoctorUser.id,
            status: 'active',
          },
        }),
      } as any);

      const result2 = await authService.login(loginDto);
      expect(result2.requires2fa).toBe(true);
    });

    it('should block login when auth-service is ACTIVE but profile-service status is INACTIVE', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'doc-uuid-123',
            userId: mockDoctorUser.id,
            status: 'INACTIVE',
          },
        }),
      } as any);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Account is inactive'),
      );
    });

    it('should block login when auth-service status is INACTIVE, regardless of profile-service', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockDoctorUser,
        status: UserStatus.INACTIVE,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'doc-uuid-123',
            userId: mockDoctorUser.id,
            status: 'ACTIVE',
          },
        }),
      } as any);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Account is inactive'),
      );
    });

    it('should fail closed and block login when profile-service is unreachable / network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Unable to verify account status, try again'),
      );
    });

    it('should fail closed and block login when profile-service request times out', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Unable to verify account status, try again'),
      );
    });

    it('should fail closed and block login when profile-service returns HTTP 500 error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Unable to verify account status, try again'),
      );
    });

    it('should block login when doctor profile is not found in profile-service (HTTP 404)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Account is inactive'),
      );
    });

    it('should fail closed when profile-service returns invalid / unparseable JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('Unexpected token in JSON')),
      } as any);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Unable to verify account status, try again'),
      );
    });

    it('should NOT call profile-service for non-doctor roles (e.g. PATIENT, HOSPITAL_ADMIN)', async () => {
      const patientUser = {
        ...mockDoctorUser,
        id: '22222222-2222-2222-2222-222222222222',
        role: UserRole.PATIENT,
        status: UserStatus.ACTIVE,
      };

      prismaService.user.findUnique.mockResolvedValue(patientUser);
      global.fetch = jest.fn();

      const result = await authService.login({
        email: 'patient@doctornow.ae',
        password: 'Password123!',
        tenantId: 'tenant-123',
      });

      expect(result).toBeDefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
