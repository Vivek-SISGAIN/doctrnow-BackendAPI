import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtService as CustomJwtService } from './services/jwt.service';
import { TokenRevocationModule } from '../token-revocation/token-revocation.module';

@Module({
  imports: [
    TokenRevocationModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // JWT module config (for optional HS256 support)
        // Primary validation uses JWKS in JwtStrategy
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, CustomJwtService],
  exports: [JwtAuthGuard, CustomJwtService],
})
export class JwtAuthModule {}

