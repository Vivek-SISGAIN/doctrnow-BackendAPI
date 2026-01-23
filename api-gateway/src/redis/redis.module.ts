import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

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

        const client = new Redis({
          host,
          port,
          password,
          db,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });

        client.on('connect', () => {
          console.log('Redis client connected');
        });

        client.on('error', (err) => {
          console.error('Redis client error:', err);
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}

