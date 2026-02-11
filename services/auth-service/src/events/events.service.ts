import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  timestamp?: Date;
}

export interface LoginSucceededEvent {
  userId: string;
  email: string;
  sessionId: string;
  tenantId: string;
  timestamp?: Date;
}

export interface LoginFailedEvent {
  email: string;
  userId?: string;
  reason: string;
  tenantId: string;
  timestamp?: Date;
}

export interface OtpSentEvent {
  userId?: string;
  email?: string;
  mobile?: string;
  purpose: string;
  tenantId: string;
  timestamp?: Date;
}

export interface OtpVerifiedEvent {
  userId?: string;
  email?: string;
  mobile?: string;
  purpose: string;
  tenantId: string;
  timestamp?: Date;
}

export interface SessionRevokedEvent {
  userId: string;
  sessionId: string;
  timestamp?: Date;
}

export interface PasswordResetRequestedEvent {
  userId: string;
  email: string;
  tenantId: string;
  timestamp?: Date;
}

export interface PasswordResetCompletedEvent {
  userId: string;
  email: string;
  tenantId: string;
  timestamp?: Date;
}

export interface AccountLockedEvent {
  userId: string;
  email: string;
  tenantId: string;
  timestamp?: Date;
}

/**
 * Events Service
 * Publishes authentication events to Kafka for audit and compliance
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private kafka: Kafka | null = null;
  private producer: any = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeKafka();
  }

  private async initializeKafka(): Promise<void> {
    const enabled = this.configService.get<boolean>('KAFKA_ENABLED', false);
    if (!enabled) {
      this.logger.log('Kafka disabled (KAFKA_ENABLED not set). Events will be logged but not published.');
      return;
    }
    try {
      const brokersConfig = this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092');
      const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'auth-service');

      // Parse brokers - handle both comma-separated string and array
      let brokers: string[];
      if (typeof brokersConfig === 'string') {
        brokers = brokersConfig.split(',').map((b) => b.trim()).filter((b) => b.length > 0);
      } else if (Array.isArray(brokersConfig)) {
        brokers = brokersConfig;
      } else {
        brokers = ['localhost:9092'];
      }

      // Validate broker format (host:port)
      brokers = brokers.filter((broker) => {
        const parts = broker.split(':');
        if (parts.length !== 2) {
          this.logger.warn(`Invalid broker format: ${broker}. Expected format: host:port`);
          return false;
        }
        const port = parseInt(parts[1], 10);
        if (isNaN(port) || port < 0 || port > 65535) {
          this.logger.warn(`Invalid broker port: ${broker}`);
          return false;
        }
        return true;
      });

      if (brokers.length === 0) {
        throw new Error('No valid Kafka brokers configured');
      }

      this.kafka = new Kafka({
        clientId,
        brokers,
      });

      this.producer = this.kafka.producer();
      await this.producer.connect();

      this.logger.log(`Kafka producer connected to brokers: ${brokers.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to initialize Kafka:', error);
      this.logger.warn('Continuing without Kafka - events will be logged but not published');
      // Continue without Kafka (events will be logged but not published)
    }
  }

  /**
   * Publish event to Kafka
   */
  private async publishEvent(topic: string, event: any): Promise<void> {
    if (!this.producer) {
      this.logger.warn(`Kafka not available, event not published: ${topic}`, event);
      return;
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: event.userId || event.email || 'unknown',
            value: JSON.stringify({
              ...event,
              timestamp: event.timestamp || new Date().toISOString(),
            }),
          },
        ],
      });
    } catch (error) {
      this.logger.error(`Failed to publish event to ${topic}:`, error);
    }
  }

  async publishUserRegistered(event: UserRegisteredEvent): Promise<void> {
    await this.publishEvent('user.registered', {
      eventType: 'UserRegistered',
      ...event,
    });
  }

  async publishLoginSucceeded(event: LoginSucceededEvent): Promise<void> {
    await this.publishEvent('auth.login.succeeded', {
      eventType: 'LoginSucceeded',
      ...event,
    });
  }

  async publishLoginFailed(event: LoginFailedEvent): Promise<void> {
    await this.publishEvent('auth.login.failed', {
      eventType: 'LoginFailed',
      ...event,
    });
  }

  async publishOtpSent(event: OtpSentEvent): Promise<void> {
    await this.publishEvent('auth.otp.sent', {
      eventType: 'OtpSent',
      ...event,
    });
  }

  async publishOtpVerified(event: OtpVerifiedEvent): Promise<void> {
    await this.publishEvent('auth.otp.verified', {
      eventType: 'OtpVerified',
      ...event,
    });
  }

  async publishSessionRevoked(event: SessionRevokedEvent): Promise<void> {
    await this.publishEvent('auth.session.revoked', {
      eventType: 'SessionRevoked',
      ...event,
    });
  }

  async publishPasswordResetRequested(event: PasswordResetRequestedEvent): Promise<void> {
    await this.publishEvent('auth.password.reset.requested', {
      eventType: 'PasswordResetRequested',
      ...event,
    });
  }

  async publishPasswordResetCompleted(event: PasswordResetCompletedEvent): Promise<void> {
    await this.publishEvent('auth.password.reset.completed', {
      eventType: 'PasswordResetCompleted',
      ...event,
    });
  }

  async publishAccountLocked(event: AccountLockedEvent): Promise<void> {
    await this.publishEvent('auth.account.locked', {
      eventType: 'AccountLocked',
      ...event,
    });
  }
}

