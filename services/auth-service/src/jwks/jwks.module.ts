import { Module } from '@nestjs/common';
import { JwksController } from './jwks.controller';
import { JwksService } from './jwks.service';
import { JwtModule } from '../jwt/jwt.module';

@Module({
  imports: [JwtModule],
  controllers: [JwksController],
  providers: [JwksService],
  exports: [JwksService],
})
export class JwksModule {}

