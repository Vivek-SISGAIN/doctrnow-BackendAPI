import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs all HTTP requests and responses
 * PHI-safe: Never logs request/response bodies or sensitive headers
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip } = request;
    const correlationId = request.headers['x-correlation-id'] || request.id;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Extract user info if available (from JWT guard)
    const userId = request.user?.userId;
    const role = request.user?.role;
    const tenantId = request.user?.tenantId;

    // Log request (PHI-safe)
    this.logger.log({
      message: 'Incoming request',
      correlationId,
      method,
      url,
      ip,
      userAgent,
      userId: userId ? this.hashUserId(userId) : undefined, // Hash for privacy
      role,
      tenantId,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log({
            message: 'Request completed',
            correlationId,
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            userId: userId ? this.hashUserId(userId) : undefined,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || error.statusCode || 500;

          this.logger.error({
            message: 'Request failed',
            correlationId,
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            error: error.message,
            userId: userId ? this.hashUserId(userId) : undefined,
          });
        },
      }),
    );
  }

  /**
   * Hash user ID for privacy (simple hash, not cryptographic)
   * In production, use proper hashing for audit logs
   */
  private hashUserId(userId: string): string {
    // Simple hash for logging - replace with proper hash in production
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `user_${Math.abs(hash).toString(36)}`;
  }
}

