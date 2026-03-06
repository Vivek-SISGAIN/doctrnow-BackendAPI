import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    trustProxy: process.env.TRUST_PROXY === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    issuer: process.env.JWT_ISSUER || 'doctornow-platform',
    audience: process.env.JWT_AUDIENCE || 'doctornow-api',
    jwksUri: process.env.JWKS_URI || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    profile: process.env.PROFILE_SERVICE_URL || 'http://localhost:3002',
    appointment: process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3003',
    consultation: process.env.CONSULTATION_SERVICE_URL || 'http://localhost:3004',
    videoChat: process.env.VIDEO_CHAT_SERVICE_URL || 'http://localhost:3005',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006',
    medicalRecords: process.env.MEDICAL_RECORDS_SERVICE_URL || 'http://localhost:3007',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008',
    hospitalAdmin: process.env.HOSPITAL_ADMIN_SERVICE_URL || 'http://localhost:3009',
    superAdmin: process.env.SUPER_ADMIN_SERVICE_URL || 'http://localhost:3010',
    audit: process.env.AUDIT_SERVICE_URL || 'http://localhost:3011',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '3000', 10),
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10),
  },
};

