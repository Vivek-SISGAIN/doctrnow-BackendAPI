import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
// import { Kafka } from 'kafkajs';

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
  otp: string;
  channel: 'EMAIL' | 'SMS';
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
 * Publishes authentication events to Redis Pub/Sub
 * (Legacy Kafka implementation retained but commented out below)
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);

  // --- REDIS IMPLEMENTATION (ACTIVE) ---
  private client: ClientProxy;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const PASSWORD = process.env.REDIS_PASSWORD || undefined;

    this.client = ClientProxyFactory.create({
      transport: Transport.REDIS,
      options: {
        host: host,
        port: port,
        password: PASSWORD,
      },
    });

    // NOTE: Legacy Kafka init comment
    // this.initializeKafka();
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log('Connected to Redis for event publishing');
    } catch (error) {
      this.logger.error('Failed to connect to Redis for event publishing', error);
    }
  }

  /**
   * Publish event to Redis
   */
  private publishEvent(topic: string, event: any): void {
    try {
      const payload = {
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      };
      // Send event
      this.client.emit(topic, payload);
    } catch (error) {
      this.logger.error(`Failed to publish event to ${topic}:`, error);
    }
  }

  /*
  // --- KAFKA IMPLEMENTATION (LEGACY, COMMENTED OUT) ---
  private kafka: Kafka | null = null;
  private producer: any = null;

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

  private async publishEventKafka(topic: string, event: any): Promise<void> {
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
  */

  // --- EVENT HELPERS ---
  async publishUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.publishEvent('user.registered', { eventType: 'UserRegistered', ...event });
  }

  async publishLoginSucceeded(event: LoginSucceededEvent): Promise<void> {
    this.publishEvent('auth.login.succeeded', { eventType: 'LoginSucceeded', ...event });
  }

  async publishLoginFailed(event: LoginFailedEvent): Promise<void> {
    this.publishEvent('auth.login.failed', { eventType: 'LoginFailed', ...event });
  }

  async publishOtpSent(event: OtpSentEvent): Promise<void> {
    this.publishEvent('auth.otp.sent', { eventType: 'OtpSent', ...event });
  }

  async publishOtpVerified(event: OtpVerifiedEvent): Promise<void> {
    this.publishEvent('auth.otp.verified', { eventType: 'OtpVerified', ...event });
  }

  async publishSessionRevoked(event: SessionRevokedEvent): Promise<void> {
    this.publishEvent('auth.session.revoked', { eventType: 'SessionRevoked', ...event });
  }

  async publishPasswordResetRequested(event: PasswordResetRequestedEvent): Promise<void> {
    this.publishEvent('auth.password.reset.requested', { eventType: 'PasswordResetRequested', ...event });
  }

  async publishPasswordResetCompleted(event: PasswordResetCompletedEvent): Promise<void> {
    this.publishEvent('auth.password.reset.completed', { eventType: 'PasswordResetCompleted', ...event });
  }

  async publishAccountLocked(event: AccountLockedEvent): Promise<void> {
    this.publishEvent('auth.account.locked', { eventType: 'AccountLocked', ...event });
  }
}
