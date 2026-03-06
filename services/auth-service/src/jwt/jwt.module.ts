import { Module } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { JwtKeyService } from './jwt-key.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [JwtService, JwtKeyService],
  exports: [JwtService, JwtKeyService],
})
export class JwtModule {}

