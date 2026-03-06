import winston from 'winston';
import expressWinston from 'express-winston';
import { config } from '../config';

// Create Winston logger
export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.logging.format === 'json'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
          })
        )
  ),
  defaultMeta: { service: 'api-gateway' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

/**
 * Request/Response logging middleware
 */
export const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}}',
  expressFormat: true,
  colorize: config.logging.format !== 'json',
  ignoreRoute: (req) => {
    // Skip logging for health checks
    return req.path === '/health' || req.path === '/api/v1/health';
  },
  requestWhitelist: ['url', 'method', 'headers', 'query', 'body'],
  responseWhitelist: ['statusCode', 'body'],
  // Mask sensitive data
  bodyBlacklist: ['password', 'token', 'authorization', 'creditCard', 'cvv'],
  headerBlacklist: ['authorization', 'cookie'],
  dynamicMeta: (req: any, res: any) => {
    return {
      userId: req.user?.userId,
      role: req.user?.role,
      tenantId: req.user?.tenantId,
      correlationId: req.headers['x-correlation-id'],
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
  },
});

/**
 * Error logging middleware
 */
export const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  meta: true,
  msg: 'Error: {{err.message}}',
  requestWhitelist: ['url', 'method', 'headers', 'query', 'body'],
  headerBlacklist: ['authorization', 'cookie'],
});

