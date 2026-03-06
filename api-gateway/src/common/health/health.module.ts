import { Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [RedisModule],
  providers: [RedisHealthIndicator],
  exports: [RedisHealthIndicator],
})
export class HealthModule {}

