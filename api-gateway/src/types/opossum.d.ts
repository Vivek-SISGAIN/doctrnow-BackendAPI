declare module 'opossum' {
  interface Options {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    volumeThreshold?: number;
    name?: string;
  }
  interface CircuitBreakerStats {
    failures?: number;
  }
  class CircuitBreaker {
    opened: boolean;
    pending: number;
    stats: CircuitBreakerStats;
    constructor(fn: (...args: any[]) => Promise<any>, options?: Options);
    fire(...args: any[]): Promise<any>;
    open(): void;
    close(): void;
    halfOpen(): void;
    shutdown(): Promise<void>;
    on(event: string, handler: (...args: any[]) => void): void;
  }
  export = CircuitBreaker;
}
