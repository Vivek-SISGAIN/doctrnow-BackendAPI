import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

export interface ProxyRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, any>;
  correlationId: string;
  userId?: string;
  role?: string;
  tenantId?: string;
}

@Injectable()
export class HttpProxyService {
  private readonly logger = new Logger(HttpProxyService.name);
  private readonly httpClients: Map<string, AxiosInstance> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  /**
   * Proxy HTTP request to downstream service
   */
  async proxyRequest(serviceName: string, request: ProxyRequest): Promise<any> {
    const serviceUrl = this.configService.get<string>(
      `${serviceName.toUpperCase()}_SERVICE_URL`,
    );

    if (!serviceUrl) {
      throw new Error(`Service URL not configured for ${serviceName}`);
    }

    // Get or create HTTP client for service
    const client = this.getHttpClient(serviceName, serviceUrl);

    // Build request config
    const axiosConfig: AxiosRequestConfig = {
      method: request.method as any,
      url: `${serviceUrl}${request.url}`,
      headers: {
        'X-Correlation-ID': request.correlationId,
        ...(request.userId && { 'X-User-ID': request.userId }),
        ...(request.role && { 'X-User-Role': request.role }),
        ...(request.tenantId && { 'X-Tenant-ID': request.tenantId }),
        ...request.headers,
        ...(!request.headers?.['content-type'] && !request.headers?.['Content-Type']
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      params: request.query,
      data: request.body,
      timeout: this.configService.get<number>('HTTP_TIMEOUT', 5000),
      maxRedirects: this.configService.get<number>('HTTP_MAX_REDIRECTS', 5),
      validateStatus: (status) => status < 500, // Don't throw on 4xx
    };

    // Support multipart uploads through the gateway (e.g. profileImage FormData).
    const contentType =
      (axiosConfig.headers?.['content-type'] as string) ||
      (axiosConfig.headers?.['Content-Type'] as string) ||
      '';
    if (typeof contentType === 'string' && contentType.startsWith('multipart/')) {
      axiosConfig.maxBodyLength = Infinity;
      axiosConfig.maxContentLength = Infinity;
      // Increase timeout for file uploads (60 seconds)
      axiosConfig.timeout = this.configService.get<number>('HTTP_UPLOAD_TIMEOUT', 60000);
    }

    const doRequest = async () => client.request(axiosConfig);

    try {
      const isCircuitBreakerEnabled = String(this.configService.get('CIRCUIT_BREAKER_ENABLED', 'false')) === 'true';
      const response = isCircuitBreakerEnabled
        ? await this.circuitBreakerService.execute(serviceName, doRequest)
        : await doRequest();

      return {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };
    } catch (error: any) {
      // Circuit breaker open -> 503 Service Unavailable (do not treat as 401)
      if (error?.message?.includes('Breaker is open') || error?.code === 'EOPENBREAKER') {
        throw {
          status: 503,
          message: 'Service temporarily unavailable. Please try again shortly.',
        };
      }
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.error({
          message: `Proxy request failed for ${serviceName}`,
          correlationId: request.correlationId,
          status: axiosError.response?.status,
          error: axiosError.message,
        });

        // Re-throw with appropriate status
        if (axiosError.response) {
          throw {
            status: axiosError.response.status,
            message: axiosError.response.statusText || axiosError.message,
            data: axiosError.response.data,
          };
        }
      }

      throw error;
    }
  }

  /**
   * Get or create HTTP client for service
   */
  private getHttpClient(serviceName: string, baseURL: string): AxiosInstance {
    if (!this.httpClients.has(serviceName)) {
      const client = axios.create({
        baseURL,
        timeout: this.configService.get<number>('HTTP_TIMEOUT', 5000),
      });

      // Request interceptor
      client.interceptors.request.use((config) => {
        this.logger.debug({
          message: `Proxying request to ${serviceName}`,
          url: config.url,
          method: config.method,
        });
        return config;
      });

      // Response interceptor
      client.interceptors.response.use(
        (response) => response,
        (error) => {
          // Log errors for monitoring
          if (error.response) {
            this.logger.warn({
              message: `Service ${serviceName} returned error`,
              status: error.response.status,
              url: error.config?.url,
            });
          }
          return Promise.reject(error);
        },
      );

      this.httpClients.set(serviceName, client);
    }

    return this.httpClients.get(serviceName)!;
  }
}
