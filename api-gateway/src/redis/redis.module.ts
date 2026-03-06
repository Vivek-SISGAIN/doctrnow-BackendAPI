import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Log Redis errors at most once per 60s to avoid console spam when Redis is down */
let lastRedisErrorLog = 0;
const REDIS_ERROR_LOG_INTERVAL_MS = 60000;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD');
        const db = configService.get<number>('REDIS_DB', 0);
        const optional = configService.get<boolean>('REDIS_OPTIONAL', false);

        // Prefer IPv4 to avoid ::1 connection issues on Windows when Redis is only on 127.0.0.1
        const resolvedHost = host === 'localhost' ? '127.0.0.1' : host;

        const client = new Redis({
          host: resolvedHost,
          port,
          password,
          db,
          lazyConnect: true, // Connect on first command, not at startup
          retryStrategy: optional ? () => null : (times) => Math.min(times * 100, 3000),
          maxRetriesPerRequest: optional ? 0 : 3,
        });

        client.on('connect', () => {
          console.log('Redis client connected');
        });

        client.on('error', (err: Error) => {
          const now = Date.now();
          if (now - lastRedisErrorLog >= REDIS_ERROR_LOG_INTERVAL_MS) {
            lastRedisErrorLog = now;
            console.error('Redis client error (logging once per minute):', err.message);
          }
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}

