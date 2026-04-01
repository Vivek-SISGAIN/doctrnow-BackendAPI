export default () => ({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8080', 10),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || true,

  // JWT Configuration (auth-service uses global prefix 'auth' + version 'v1', so JWKS is under /auth/v1/)
  JWT_JWKS_URI: process.env.JWT_JWKS_URI || 'http://localhost:3001/auth/v1/.well-known/jwks.json',
  JWT_ISSUER: process.env.JWT_ISSUER || 'doctornow-platform',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'doctornow-api',
  JWT_ALGORITHM: process.env.JWT_ALGORITHM || 'RS256',
  // Dev only: skip JWT for /api/v1/appointments so you can test without auth-service (set to false for real auth)
  SKIP_APPOINTMENT_AUTH:
    process.env.SKIP_APPOINTMENT_AUTH === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.SKIP_APPOINTMENT_AUTH !== 'false'),

  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),
  // When true (default in development): no retry spam, token revocation skips if Redis down, health skips Redis
  REDIS_OPTIONAL:
    process.env.REDIS_OPTIONAL === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.REDIS_OPTIONAL !== 'false'),

  // Rate Limiting
  RATE_LIMIT_TTL: parseInt(process.env.RATE_LIMIT_TTL || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  RATE_LIMIT_AUTH_TTL: parseInt(process.env.RATE_LIMIT_AUTH_TTL || '900000', 10),
  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),

  // CORS (doctor portal = 5173, patient portal = 3000; add more as needed)
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://localhost:8081',
    'http://localhost:1234',
  ],
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true' || true,

  // Service URLs (profile-service default 5000, medical-records default 3004 per repo setup)
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  PROFILE_SERVICE_URL: process.env.PROFILE_SERVICE_URL || 'http://localhost:5000',
  APPOINTMENT_SERVICE_URL: process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3003',
  CONSULTATION_SERVICE_URL: process.env.CONSULTATION_SERVICE_URL || 'http://localhost:3005',
  VIDEO_CHAT_SERVICE_URL: process.env.VIDEO_CHAT_SERVICE_URL || 'http://localhost:3007',
  PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006',
  MEDICAL_RECORDS_SERVICE_URL: process.env.MEDICAL_RECORDS_SERVICE_URL || 'http://localhost:3007',
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4000',
  HOSPITAL_ADMIN_SERVICE_URL: process.env.HOSPITAL_ADMIN_SERVICE_URL || 'http://localhost:3009',
  SUPER_ADMIN_SERVICE_URL: process.env.SUPER_ADMIN_SERVICE_URL || 'http://localhost:5001',
  AUDIT_SERVICE_URL: process.env.AUDIT_SERVICE_URL || 'http://localhost:3011',

  // Circuit Breaker (disabled in dev so "Breaker is open" doesn't block when a service is down)
  CIRCUIT_BREAKER_ENABLED:
    process.env.CIRCUIT_BREAKER_ENABLED === 'true' || process.env.NODE_ENV === 'production',
  CIRCUIT_BREAKER_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '3000', 10),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: parseInt(
    process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50',
    10,
  ),
  CIRCUIT_BREAKER_RESET_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10),

  // HTTP Client
  HTTP_TIMEOUT: parseInt(process.env.HTTP_TIMEOUT || '5000', 10),
  HTTP_MAX_REDIRECTS: parseInt(process.env.HTTP_MAX_REDIRECTS || '5', 10),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Agora (video call token generation – App Certificate = Primary Certificate from console)
  AGORA_APP_ID: process.env.AGORA_APP_ID || '',
  AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE || '',
});
