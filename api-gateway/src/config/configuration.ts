export default () => ({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8080', 10),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || true,

  // JWT Configuration
  JWT_JWKS_URI: process.env.JWT_JWKS_URI || 'http://localhost:3001/.well-known/jwks.json',
  JWT_ISSUER: process.env.JWT_ISSUER || 'doctornow-platform',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'doctornow-api',
  JWT_ALGORITHM: process.env.JWT_ALGORITHM || 'RS256',

  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),

  // Rate Limiting
  RATE_LIMIT_TTL: parseInt(process.env.RATE_LIMIT_TTL || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  RATE_LIMIT_AUTH_TTL: parseInt(process.env.RATE_LIMIT_AUTH_TTL || '900000', 10),
  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),

  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true' || true,

  // Service URLs
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  PROFILE_SERVICE_URL: process.env.PROFILE_SERVICE_URL || 'http://localhost:3002',
  APPOINTMENT_SERVICE_URL: process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3003',
  CONSULTATION_SERVICE_URL: process.env.CONSULTATION_SERVICE_URL || 'http://localhost:3004',
  VIDEO_CHAT_SERVICE_URL: process.env.VIDEO_CHAT_SERVICE_URL || 'http://localhost:3005',
  PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006',
  MEDICAL_RECORDS_SERVICE_URL: process.env.MEDICAL_RECORDS_SERVICE_URL || 'http://localhost:3007',
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008',
  HOSPITAL_ADMIN_SERVICE_URL: process.env.HOSPITAL_ADMIN_SERVICE_URL || 'http://localhost:3009',
  SUPER_ADMIN_SERVICE_URL: process.env.SUPER_ADMIN_SERVICE_URL || 'http://localhost:3010',
  AUDIT_SERVICE_URL: process.env.AUDIT_SERVICE_URL || 'http://localhost:3011',

  // Circuit Breaker
  CIRCUIT_BREAKER_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '3000', 10),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: parseInt(
    process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50',
    10,
  ),
  CIRCUIT_BREAKER_RESET_TIMEOUT: parseInt(
    process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000',
    10,
  ),

  // HTTP Client
  HTTP_TIMEOUT: parseInt(process.env.HTTP_TIMEOUT || '5000', 10),
  HTTP_MAX_REDIRECTS: parseInt(process.env.HTTP_MAX_REDIRECTS || '5', 10),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
});

