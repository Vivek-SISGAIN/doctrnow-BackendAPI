export default () => ({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || true,

  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doctornow:changeme@localhost:5432/auth_db',

  // JWT Configuration
  JWT_ISSUER: process.env.JWT_ISSUER || 'doctornow-platform',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'doctornow-api',
  JWT_ACCESS_TOKEN_TTL: parseInt(process.env.JWT_ACCESS_TOKEN_TTL || '900', 10), // 15 minutes
  JWT_REFRESH_TOKEN_TTL: parseInt(process.env.JWT_REFRESH_TOKEN_TTL || '604800', 10), // 7 days

  // Password Security
  PASSWORD_HASH_ROUNDS: process.env.PASSWORD_HASH_ROUNDS || '12', // Keep as string, parse in service
  PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
  PASSWORD_REQUIRE_UPPERCASE: process.env.PASSWORD_REQUIRE_UPPERCASE === 'true' || true,
  PASSWORD_REQUIRE_LOWERCASE: process.env.PASSWORD_REQUIRE_LOWERCASE === 'true' || true,
  PASSWORD_REQUIRE_NUMBER: process.env.PASSWORD_REQUIRE_NUMBER === 'true' || true,
  PASSWORD_REQUIRE_SPECIAL: process.env.PASSWORD_REQUIRE_SPECIAL === 'true' || false,

  // Account Lockout
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30', 10),

  // OTP Configuration
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || '6', 10),
  OTP_TTL_SECONDS: parseInt(process.env.OTP_TTL_SECONDS || '300', 10), // 5 minutes
  OTP_MAX_ATTEMPTS: parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10),

  // Rate Limiting
  RATE_LIMIT_TTL: parseInt(process.env.RATE_LIMIT_TTL || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  RATE_LIMIT_LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
  RATE_LIMIT_OTP_MAX: parseInt(process.env.RATE_LIMIT_OTP_MAX || '3', 10),

  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true' || true,

  // Event Bus (Kafka) – disabled by default so auth-service starts without Kafka in dev
  KAFKA_ENABLED: process.env.KAFKA_ENABLED === 'true' || process.env.NODE_ENV === 'production',
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'auth-service',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'auth-service-group',

  // Encryption (for private keys)
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '', // Must be set in production

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
});

