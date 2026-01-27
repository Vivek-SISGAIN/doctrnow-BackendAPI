import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PasswordService } from './password.service';
import { PasswordResetRequestDto, PasswordResetConfirmDto } from './dto/password.dto';

@ApiTags('password')
@Controller('password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Public()
  @Post('reset-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset request processed',
  })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.passwordService.requestPasswordReset(dto);
  }

  @Public()
  @Post('reset-confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm password reset with token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or password policy violation',
  })
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.passwordService.confirmPasswordReset(dto);
  }
}

