import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { Public } from './common/decorators/public.decorator';
import { RedisHealthIndicator } from './common/health/redis.health';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @Get('health')
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint with system checks' })
  @ApiResponse({
    status: 200,
    description: 'Gateway is healthy',
  })
  @ApiResponse({
    status: 503,
    description: 'Gateway is unhealthy',
  })
  check() {
    return this.health.check([
      // Memory check
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024), // 300MB

      // Disk check
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9, // Alert if disk usage > 90%
        }),

      // Redis check
      () => this.redis.isHealthy('redis'),
    ]);
  }

  @Public()
  @Get('health/liveness')
  @ApiOperation({ summary: 'Liveness probe (simple check)' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
  })
  liveness(): { status: string; service: string; timestamp: string } {
    return {
      status: 'alive',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    };
  }
}

