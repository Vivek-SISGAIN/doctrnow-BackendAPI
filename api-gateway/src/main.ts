import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  // Proxy WebSocket /consultation-events to consultation-service
  const { createProxyMiddleware } = require('http-proxy-middleware');
  const consultationUrl = configService.get<string>('CONSULTATION_SERVICE_URL', 'http://localhost:3005');
  
  app.use(
    '/consultation-events',
    createProxyMiddleware({
      target: consultationUrl,
      changeOrigin: true,
      ws: true, // proxy websockets
      logLevel: 'debug',
    })
  );

  // Trust proxy (Express expects number, string, or array, not boolean)
  // Use 1 to trust first proxy, or 'loopback' for local development
  const trustProxy = configService.get<boolean>('TRUST_PROXY', true);
  app.set('trust proxy', trustProxy ? 1 : false);

  // Security: Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Adjust based on frontend requirements
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // CORS — use a callback so only the single matched origin is echoed back,
  // never a comma-joined list (which browsers reject per the CORS spec).
  const rawOrigins = configService.get<string | string[]>('CORS_ORIGINS', []);
  const allowedOrigins: string[] =
    typeof rawOrigins === 'string' ? rawOrigins.split(',').map((o) => o.trim()) : rawOrigins;

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Allow server-to-server requests (no Origin header) and matched origins
      if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
        callback(null, requestOrigin || true);
      } else {
        callback(new Error(`Origin '${requestOrigin}' not allowed by CORS policy`));
      }
    },
    credentials: configService.get<boolean>('CORS_CREDENTIALS', true),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-ID',
      'X-Tenant-ID',
      'X-Request-ID',
      'x-client',
    ],
    exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });

  // API Versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Validation Pipe (strict, whitelist)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Reject requests with unknown properties
      transform: true, // Auto-transform payloads to DTOs
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: configService.get<string>('NODE_ENV') === 'production',
    }),
  );

  // Global Interceptors
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // Swagger/OpenAPI (dev/staging only)
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('DoctorNow API Gateway')
      .setDescription(
        'Enterprise-grade API Gateway for DoctorNow Platform. Single entry point for all microservices.',
      )
      .setVersion('2.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
        'JWT-auth',
      )
      .addTag('health', 'Health check endpoints')
      .addTag('auth', 'Authentication endpoints (public)')
      .addTag('profiles', 'Profile management')
      .addTag('appointments', 'Appointment management')
      .addTag('hospital-admin', 'Hospital admin (health services, packages, doctors)')
      .addTag('consultations', 'Consultation management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log('Swagger documentation available at /api-docs');
  }

  const port = configService.get<number>('PORT', 8080);
  await app.listen(port);

  logger.log(`🚀 API Gateway running on port ${port}`);
  logger.log(`📝 Environment: ${configService.get<string>('NODE_ENV', 'development')}`);
  logger.log(`🔐 JWT JWKS URI: ${configService.get<string>('JWT_JWKS_URI', 'not configured')}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start API Gateway:', error);
  process.exit(1);
});
