import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { config } from '../config';

// Create Redis client for distributed rate limiting
let redisClient: ReturnType<typeof createClient> | null = null;

if (config.redis.host) {
  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.connect().catch(console.error);
}

// Simple Redis store for rate limiting
class RedisStore implements rateLimit.Store {
  client: ReturnType<typeof createClient>;
  prefix: string;

  constructor(options: { client: ReturnType<typeof createClient>; prefix?: string }) {
    this.client = options.client;
    this.prefix = options.prefix || 'rl:';
  }

  async increment(key: string): Promise<rateLimit.IncrementResponse> {
    const fullKey = `${this.prefix}${key}`;
    const count = await this.client.incr(fullKey);
    
    if (count === 1) {
      await this.client.expire(fullKey, Math.ceil(config.rateLimit.windowMs / 1000));
    }
    
    return {
      totalHits: count,
      resetTime: new Date(Date.now() + config.rateLimit.windowMs),
    };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    await this.client.decr(fullKey);
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    await this.client.del(fullKey);
  }

  async shutdown(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Global rate limiter - applies to all requests
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
  store: redisClient
    ? new RedisStore({
        client: redisClient,
        prefix: 'rl:global:',
      })
    : undefined,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  store: redisClient
    ? new RedisStore({
        client: redisClient,
        prefix: 'rl:auth:',
      })
    : undefined,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

/**
 * Per-user rate limiter (uses user ID from token)
 */
export const userRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests * 2, // Higher limit for authenticated users
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Use user ID if available, otherwise fall back to IP
    return req.user?.userId || req.ip;
  },
  store: redisClient
    ? new RedisStore({
        client: redisClient,
        prefix: 'rl:user:',
      })
    : undefined,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded for your account',
    },
  },
});

