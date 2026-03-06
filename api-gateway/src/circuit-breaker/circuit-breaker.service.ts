import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';

interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(
    serviceName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const breaker = this.getOrCreateCircuitBreaker(serviceName);
    return breaker.fire(fn) as Promise<T>;
  }

  /**
   * Get circuit breaker state for monitoring
   */
  getCircuitBreakerState(serviceName: string): {
    opened: boolean;
    pending: number;
    failures: number;
  } {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {
      return { opened: false, pending: 0, failures: 0 };
    }

    return {
      opened: breaker.opened,
      pending: breaker.pending,
      failures: (breaker.stats as any).failures || 0,
    };
  }

  /**
   * Get or create circuit breaker for service
   */
  private getOrCreateCircuitBreaker(
    serviceName: string,
  ): CircuitBreaker {
    if (this.circuitBreakers.has(serviceName)) {
      return this.circuitBreakers.get(serviceName)!;
    }

    const options: CircuitBreakerOptions = {
      timeout: this.configService.get<number>(
        'CIRCUIT_BREAKER_TIMEOUT',
        3000,
      ),
      errorThresholdPercentage: this.configService.get<number>(
        'CIRCUIT_BREAKER_ERROR_THRESHOLD',
        50,
      ),
      resetTimeout: this.configService.get<number>(
        'CIRCUIT_BREAKER_RESET_TIMEOUT',
        30000,
      ),
    };

    const breaker = new CircuitBreaker(
      async (fn: () => Promise<any>) => fn(),
      {
        ...options,
        name: serviceName,
      },
    );

    // Event listeners for monitoring
    breaker.on('open', () => {
      this.logger.error(`Circuit breaker OPEN for ${serviceName}`);
    });

    breaker.on('halfOpen', () => {
      this.logger.log(`Circuit breaker HALF-OPEN for ${serviceName}`);
    });

    breaker.on('close', () => {
      this.logger.log(`Circuit breaker CLOSED for ${serviceName}`);
    });

    breaker.on('failure', (error: Error) => {
      this.logger.warn(`Circuit breaker failure for ${serviceName}: ${error.message}`);
    });

    this.circuitBreakers.set(serviceName, breaker);
    return breaker;
  }
}

