import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { PasswordService } from './password.service';
import { AccountLockoutService } from './account-lockout.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '../jwt/jwt.module';
import { EventsModule } from '../events/events.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [PrismaModule, JwtModule, EventsModule, forwardRef(() => OtpModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    AccountLockoutService,
  ],
  exports: [AuthService, PasswordService, SessionService], // Export PasswordService for use in PasswordModule
})
export class AuthModule {}

