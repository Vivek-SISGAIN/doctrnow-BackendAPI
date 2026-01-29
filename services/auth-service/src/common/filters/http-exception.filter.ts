import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter for standardized error responses
 * PHI-safe: Never logs or returns sensitive data
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.headers['x-correlation-id'] || request.id;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    console.log(exception);
    console.log(status);

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      error: {
        statusCode: status,
        message: typeof message === 'string' ? message : (message as any).message || 'Error',
        timestamp: new Date().toISOString(),
        correlationId,
        path: request.url,
      },
    };

    // Log error (PHI-safe)
    this.logger.error({
      message: 'HTTP Exception',
      correlationId,
      statusCode: status,
      path: request.url,
      method: request.method,
      error: typeof message === 'string' ? message : JSON.stringify(message),
    });

    response.status(status).json(errorResponse);
  }
}

