import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsultationEventsGateway } from './consultation-events.gateway';
import { ConsultationEventsService } from './consultation-events.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || config.get<string>('JWT_PUBLIC_KEY') || 'dev-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [ConsultationEventsGateway, ConsultationEventsService],
  exports: [ConsultationEventsService],
})
export class ConsultationEventsModule {}
