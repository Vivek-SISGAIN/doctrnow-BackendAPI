import { Module } from '@nestjs/common';
import { TokenRevocationService } from './token-revocation.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [TokenRevocationService],
  exports: [TokenRevocationService],
})
export class TokenRevocationModule {}

