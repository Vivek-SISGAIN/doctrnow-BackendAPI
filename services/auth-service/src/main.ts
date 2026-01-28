import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  // Trust proxy (Express expects number, string, or array, not boolean)
  // Use 1 to trust first proxy, or 'loopback' for local development
  const trustProxy = configService.get<boolean>('TRUST_PROXY', true);
  app.set('trust proxy', trustProxy ? 1 : false);

  // CORS
  app.enableCors({
    origin: configService.get<string[]>('CORS_ORIGINS', []),
    credentials: configService.get<boolean>('CORS_CREDENTIALS', true),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-ID',
      'X-Tenant-ID',
    ],
  });

  // API Versioning
  app.setGlobalPrefix('auth');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: configService.get<string>('NODE_ENV') === 'production',
    }),
  );

  // Global Exception Filter
  // Note: HttpExceptionFilter is registered in app.module.ts as APP_FILTER

  // Swagger/OpenAPI (dev/staging only)
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('DoctorNow Authentication Service')
      .setDescription('Authentication & Identity Service API')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('otp', 'OTP endpoints')
      .addTag('password', 'Password management')
      .addTag('jwks', 'JWKS endpoint')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);

    logger.log('Swagger documentation available at /api-docs');
  }

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);

  logger.log(`🚀 Authentication Service running on port ${port}`);
  logger.log(`📝 Environment: ${configService.get<string>('NODE_ENV', 'development')}`);
  logger.log(`🔐 JWT Issuer: ${configService.get<string>('JWT_ISSUER', 'doctornow-platform')}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start Authentication Service:', error);
  process.exit(1);
});

