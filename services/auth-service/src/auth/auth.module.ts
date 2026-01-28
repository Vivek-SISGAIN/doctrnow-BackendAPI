import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { PasswordService } from './password.service';
import { AccountLockoutService } from './account-lockout.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '../jwt/jwt.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, JwtModule, EventsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    AccountLockoutService,
  ],
  exports: [AuthService, PasswordService], // Export PasswordService for use in PasswordModule
})
export class AuthModule {}

