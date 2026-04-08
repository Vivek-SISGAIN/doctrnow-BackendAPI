import { IsEmail, IsString, IsEnum, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OtpPurpose, UserRole, UserStatus } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+971501234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'SecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.PATIENT })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  password!: string;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class LoginByOtpDto {
  @ApiProperty({ example: '+971501234567' })
  @IsString()
  @IsOptional()
  mobile?: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp!: string;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus, example: 'ACTIVE' })
  @IsEnum(UserStatus)
  status!: UserStatus;
}

// ─── OTP-based Registration DTOs ─────────────────────────────────────────────
// Only DOCTOR and PATIENT roles may use these endpoints.

export class RequestRegisterOtpDto {
  @ApiProperty({ example: '+971501234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'user@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.PATIENT,
    description: 'Only DOCTOR and PATIENT are allowed',
  })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;
}

export class RegisterByOtpDto {
  @ApiProperty({ example: '+971501234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'user@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp!: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.PATIENT,
    description: 'Only DOCTOR and PATIENT are allowed',
  })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class RequestLoginOtpDto {
  @ApiProperty({ example: '+971501234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'user@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;
}

export class SendOtpRequestDto {
  @ApiProperty({ example: '+971501234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'user@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: OtpPurpose, example: 'LOGIN' })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @ApiProperty({ example: 'SecurePassword123!', required: false })
  @IsOptional()
  password?: string;

  // @ApiProperty({ example: 'tenant-uuid' })
  // @IsString()
  // tenantId!: string;

  // Only required when purpose === REGISTRATION
  @ApiProperty({ enum: UserRole, required: false })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class VerifyOtpRequestDto {
  @ApiProperty({ example: '+971501234567', required: false })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({ example: 'user@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '111111' })
  @IsString()
  otp!: string;
}
