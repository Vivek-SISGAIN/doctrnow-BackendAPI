import { Module } from '@nestjs/common';
import { HttpProxyService } from './http-proxy.service';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';

@Module({
  imports: [CircuitBreakerModule],
  providers: [HttpProxyService],
  exports: [HttpProxyService],
})
export class HttpProxyModule {}

