import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';

/**
 * Redis Health Indicator
 * Checks Redis connectivity for health checks
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await this.redisService.ping();
      const isHealthy = result === 'PONG';

      if (isHealthy) {
        return this.getStatus(key, true, { message: 'Redis is healthy' });
      }

      throw new HealthCheckError('Redis health check failed', this.getStatus(key, false));
    } catch (error) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { error: error instanceof Error ? error.message : 'Unknown error' }),
      );
    }
  }
}

