import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Delete,
  Param,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  LoginByOtpDto,
  UpdateUserStatusDto,
  SendOtpRequestDto,
  VerifyOtpRequestDto,
} from './dto/auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { Get } from '@nestjs/common';

function decodeJwtPayloadUnsafe(
  token: string,
): { sub?: string; userId?: string; role?: string; tenantId?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: string;
      userId?: string;
      role?: string;
      tenantId?: string;
    };
    return payload;
  } catch {
    return null;
  }
}
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or password policy violation',
  })
  @ApiResponse({
    status: 409,
    description: 'User already exists',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account locked',
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login({
      ...dto,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('login/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login by OTP (phone)' })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns tokens',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP',
  })
  async loginByOtp(@Body() dto: LoginByOtpDto, @Req() req: Request) {
    return this.authService.loginByOtp({
      ...dto,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout (revoke current session)' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  async logout(@Body() dto: LogoutDto, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    return this.authService.logout(dto.sessionId, userId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout all sessions' })
  @ApiResponse({
    status: 200,
    description: 'All sessions revoked',
  })
  async logoutAll(@Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    return this.authService.logoutAll(userId);
  }

  @Delete('users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Hard delete user (permanent)' })
  @ApiResponse({
    status: 200,
    description: 'User permanently deleted',
  })
  @ApiResponse({
    status: 400,
    description: 'User not found',
  })
  async hardDeleteUser(@Param('userId') userId: string) {
    return this.authService.hardDeleteUser(userId);
  }

  @Patch('users/:userId/status')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user status (ACTIVE / INACTIVE)' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 400, description: 'User not found' })
  async updateUserStatus(@Param('userId') userId: string, @Body() dto: UpdateUserStatusDto) {
    return this.authService.updateUserStatus(userId, dto.status);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'User fetched successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@Req() req: Request) {
    const decodedUser = decodeJwtPayloadUnsafe(req.headers.authorization?.split(' ')[1] || '');

    const userId = decodedUser?.sub || decodedUser?.userId;

    if (!userId) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return this.authService.getUserById(userId);
  }

  // ─── OTP-based Registration (DOCTOR & PATIENT only) ─────────────────────────
  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP for login or registration (DOCTOR / PATIENT only)' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or missing role for registration' })
  @ApiResponse({ status: 401, description: 'Role not permitted or account inactive' })
  @ApiResponse({ status: 409, description: 'User already exists (registration)' })
  async sendOtp(@Body() dto: SendOtpRequestDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP — logs in or registers based on purpose' })
  @ApiResponse({ status: 200, description: 'Returns access token, refresh token, and user' })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 409, description: 'User already exists (registration race condition)' })
  async verifyOtp(@Body() dto: VerifyOtpRequestDto) {
    return this.authService.verifyOtp({
      ...dto,
    });
  }
}
