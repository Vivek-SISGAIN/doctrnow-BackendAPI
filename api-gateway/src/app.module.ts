import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller';
import { ConfigModule as AppConfigModule } from './config/config.module';
import { JwtAuthModule } from './auth/jwt-auth.module';
import { TokenRevocationModule } from './token-revocation/token-revocation.module';
import { HttpProxyModule } from './http-proxy/http-proxy.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { HealthModule } from './common/health/health.module';

import { AuthController } from './controllers/auth.controller';
import { ProfileController } from './controllers/profile.controller';
import { AppointmentController } from './controllers/appointment.controller';
import { ConsultationController } from './controllers/consultation.controller';
import { ConsultationNotesController } from './controllers/consultation-notes.controller';
import { PrescriptionController } from './controllers/prescription.controller';
import { DocumentController } from './controllers/document.controller';
import { LabReportController } from './controllers/lab-report.controller';
import { HospitalAdminController } from './controllers/hospital-admin.controller';
import { AgoraController } from './controllers/agora.controller';

import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // Structured Logging (Pino)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('LOG_LEVEL', 'info'),
          transport:
            configService.get<string>('NODE_ENV') === 'development'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                  },
                }
              : undefined,
          serializers: {
            req: (req: any) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              headers: {
                'x-correlation-id': req.headers['x-correlation-id'],
              },
              // NEVER log PHI or sensitive data
            }),
            res: (res: any) => ({
              statusCode: res.statusCode,
            }),
          },
          // Remove sensitive headers
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
          },
        },
      }),
    }),

    // Rate limiting (in-memory by default; use Redis storage in production for multi-instance)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('RATE_LIMIT_TTL', 900000), // 15 minutes
            limit: configService.get<number>('RATE_LIMIT_MAX', 100),
          },
        ],
      }),
    }),

    // Health Checks
    TerminusModule,
    HealthModule,

    // App Modules
    AppConfigModule,
    JwtAuthModule,
    TokenRevocationModule,
    HttpProxyModule,
    CircuitBreakerModule,

    // Controllers
    // (Imported via controller files)
  ],
  controllers: [
    AppController,
    AuthController,
    ProfileController,
    AppointmentController,
    ConsultationController,
    ConsultationNotesController,
    PrescriptionController,
    DocumentController,
    LabReportController,
    HospitalAdminController,
    AgoraController,
  ],
  providers: [
    // Global Guards (execution order: Throttler → JWT → Roles)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Applied globally, skipped for @Public() routes
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // RBAC enforcement
    },

    // Global Filters
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // Global Interceptors (execution order: Correlation → Logging → Transform)
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
