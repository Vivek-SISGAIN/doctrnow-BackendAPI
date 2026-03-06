import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'tenant-uuid' })
  @IsString()
  tenantId!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ example: 'reset-token-string' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'NewSecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

