import CircuitBreaker from 'opossum';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
}

// Store circuit breakers per service
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Creates a circuit breaker for service calls
 */
export function getOrCreateCircuitBreaker(
  serviceName: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  if (circuitBreakers.has(serviceName)) {
    return circuitBreakers.get(serviceName)!;
  }

  const breaker = new CircuitBreaker(
    async (req: Request, res: Response, next: NextFunction) => {
      // This will be wrapped around the actual proxy middleware
      return Promise.resolve();
    },
    {
      timeout: options?.timeout || config.circuitBreaker.timeout,
      errorThresholdPercentage: options?.errorThresholdPercentage || config.circuitBreaker.errorThresholdPercentage,
      resetTimeout: options?.resetTimeout || config.circuitBreaker.resetTimeout,
      name: serviceName,
    }
  );

  // Event listeners for monitoring
  breaker.on('open', () => {
    console.error(`Circuit breaker OPEN for ${serviceName} - service unavailable`);
  });

  breaker.on('halfOpen', () => {
    console.log(`Circuit breaker HALF-OPEN for ${serviceName} - testing connection`);
  });

  breaker.on('close', () => {
    console.log(`Circuit breaker CLOSED for ${serviceName} - service available`);
  });

  breaker.on('failure', (error: Error) => {
    console.error(`Circuit breaker failure for ${serviceName}:`, error.message);
  });

  circuitBreakers.set(serviceName, breaker);
  return breaker;
}

