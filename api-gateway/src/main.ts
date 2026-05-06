import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { connectDB } from './config/database';
import { auditMiddleware } from './middleware/auditMiddleware';
import * as express from 'express';

async function bootstrap(): Promise<void> {
  // Connect to DB before any processing
  await connectDB();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  // ─── Helper: safely parse env booleans ───────────────────────────────────────
  // ConfigService.get<boolean>() does NOT cast strings — it returns the raw
  // string from .env. Always use this helper for any boolean env var.
  const getBool = (key: string, fallback: boolean): boolean => {
    const val = configService.get<string>(key);
    if (val === undefined || val === null || val === '') return fallback;
    return val === 'true';
  };

  // ─── Helper: safely parse env integers ───────────────────────────────────────
  const getInt = (key: string, fallback: number): number => {
    const val = configService.get<string>(key);
    const parsed = parseInt(val ?? '', 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  // We need to parse request bodies to log them in the auditMiddleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ─── AUDIT MIDDLEWARE ─────────────────────────────────────────────────────────
  // Registered before proxy routes so every request is captured
  app.use(auditMiddleware);

  // ─── WebSocket proxy for consultation-service SSE/WS ─────────────────────────
  const { createProxyMiddleware } = require('http-proxy-middleware');
  const consultationUrl =
    configService.get<string>('CONSULTATION_SERVICE_URL') ?? 'http://localhost:3005';

  const consultationProxy = createProxyMiddleware({
    target: consultationUrl,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
  });

  app.use('/consultation-events', consultationProxy);

  // ─── WebSocket proxy for video-chat-service (Socket.IO) ───────────────────
  const videoChatUrl =
    configService.get<string>('VIDEO_CHAT_SERVICE_URL') ?? 'http://localhost:3007';
  const notificationServiceUrl =
    configService.get<string>('NOTIFICATION_SERVICE_URL') ?? 'http://localhost:3008';

  // /socket.io — default Socket.IO path (used internally)
  const socketIoProxy = createProxyMiddleware({
    target: videoChatUrl,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
  });

  app.use('/socket.io', socketIoProxy);

  // /chat-events — the path the patient/doctor frontend socket managers use
  const chatEventsProxy = createProxyMiddleware({
    target: videoChatUrl,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    pathRewrite: { '^/chat-events': '/socket.io' }, // rewrite to actual socket.io path
  });

  app.use('/chat-events', chatEventsProxy);

  // /notification-events — path used by hospital-admin frontend for in-app notifications
  const notificationEventsProxy = createProxyMiddleware({
    target: notificationServiceUrl,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    pathRewrite: { '^/notification-events': '/socket.io' },
  });

  app.use('/notification-events', notificationEventsProxy);

  // ─── Manual WebSocket Upgrade Handling ─────────────────────────────────────
  // In NestJS + http-proxy-middleware v3, we must manually bind the 'upgrade' event
  // to the server to ensure WebSocket connections are correctly proxied.
  const httpServer = app.getHttpServer();
  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (url.startsWith('/chat-events')) {
      chatEventsProxy.upgrade(req, socket, head);
    } else if (url.startsWith('/socket.io')) {
      socketIoProxy.upgrade(req, socket, head);
    } else if (url.startsWith('/notification-events')) {
      notificationEventsProxy.upgrade(req, socket, head);
    } else if (url.startsWith('/consultation-events')) {
      consultationProxy.upgrade(req, socket, head);
    }
  });

  // ─── Trust proxy ─────────────────────────────────────────────────────────────
  // Required for correct IP detection behind Nginx / load balancers.
  // Use 1 (first proxy) in production, false for direct local dev.
  const trustProxy = getBool('TRUST_PROXY', true);
  app.set('trust proxy', trustProxy ? 1 : false);

  // ─── Helmet (security headers) ───────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false, // frontend sets its own CSP
      crossOriginEmbedderPolicy: false, // needed for Agora / video embeds
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────────────────
  // Reads CORS_ORIGINS as a comma-separated string from .env.
  // Uses a callback so exactly ONE matched origin is echoed back —
  // browsers reject responses where Access-Control-Allow-Origin is a list.
  const rawOrigins = configService.get<string>('CORS_ORIGINS') ?? '';
  const parsedOrigins: string[] = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Fallback for local dev when CORS_ORIGINS is not set in .env
  const devFallbackOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://localhost:8081',
    'http://localhost:1234',
  ];
  const allowedOrigins = parsedOrigins.length > 0 ? parsedOrigins : devFallbackOrigins;

  // getBool ensures this is always a real boolean — never a string 'true'.
  // The cors package requires strict boolean true for credentials, not 'true'.
  const corsCredentials = getBool('CORS_CREDENTIALS', true);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Allow server-to-server / curl / health-check requests (no Origin header)
      if (!requestOrigin) return callback(null, true);
      if (allowedOrigins.includes(requestOrigin)) return callback(null, requestOrigin);
      callback(new Error(`CORS: Origin '${requestOrigin}' is not allowed`));
    },
    credentials: corsCredentials, // ← must be boolean true, never string 'true'
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
    maxAge: 86400, // cache preflight for 24h — reduces OPTIONS request spam
  });

  // ─── API versioning ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ─── Global validation pipe ───────────────────────────────────────────────────
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: isProduction,
    }),
  );

  // ─── Global interceptors ──────────────────────────────────────────────────────
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // ─── Swagger (dev + staging only, never in production) ───────────────────────
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
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
      .addTag('notifications', 'Notification management (push, email, SMS, OTP)')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    logger.log(`📖 Swagger docs → http://localhost:${getInt('PORT', 8080)}/api-docs`);
  }

  // ─── Start server ─────────────────────────────────────────────────────────────
  const port = getInt('PORT', 8080);
  await app.listen(port);

  logger.log(`🚀 API Gateway running on port ${port}`);
  logger.log(`🌍 Environment : ${configService.get<string>('NODE_ENV') ?? 'development'}`);
  logger.log(`🔐 JWKS URI    : ${configService.get<string>('JWT_JWKS_URI') ?? 'not configured'}`);
  logger.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
  logger.log(`🔑 Credentials : ${corsCredentials}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start API Gateway:', error);
  process.exit(1);
});
