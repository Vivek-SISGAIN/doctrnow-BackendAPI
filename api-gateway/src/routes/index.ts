import { Router, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import { authenticateJWT, authorize, AuthRequest } from '../middleware/auth';
import { getOrCreateCircuitBreaker } from '../middleware/circuitBreaker';
import { userRateLimiter, authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Service proxy configuration
 */
interface ServiceConfig {
  target: string;
  pathRewrite?: { [key: string]: string };
  changeOrigin?: boolean;
  onProxyReq?: (proxyReq: any, req: any, res: any) => void;
  onProxyRes?: (proxyRes: any, req: any, res: any) => void;
  onError?: (err: Error, req: any, res: any) => void;
}

/**
 * Creates a proxy middleware with circuit breaker
 */
function createServiceProxy(serviceConfig: ServiceConfig, serviceName: string) {
  const breaker = getOrCreateCircuitBreaker(serviceName);
  
  const proxyMiddleware = createProxyMiddleware({
    target: serviceConfig.target,
    changeOrigin: serviceConfig.changeOrigin ?? true,
    pathRewrite: serviceConfig.pathRewrite,
    on: {
      proxyReq: (proxyReq: any, req: any) => {
        // Add correlation ID
        const correlationId = req.headers['x-correlation-id'] || req.id || `req-${Date.now()}`;
        proxyReq.setHeader('x-correlation-id', correlationId);

        // Forward user information
        if (req.user) {
          proxyReq.setHeader('x-user-id', req.user.userId);
          proxyReq.setHeader('x-user-role', req.user.role);
          if (req.user.tenantId) {
            proxyReq.setHeader('x-tenant-id', req.user.tenantId);
          }
        }

        // Forward original IP
        proxyReq.setHeader('x-forwarded-for', req.ip || req.connection?.remoteAddress);
        proxyReq.setHeader('x-forwarded-proto', req.protocol);

        if (serviceConfig.onProxyReq) {
          serviceConfig.onProxyReq(proxyReq, req, null as any);
        }
      },
      proxyRes: (proxyRes: any, req: any) => {
        // Add correlation ID to response
        const correlationId = req.headers['x-correlation-id'] || req.id;
        if (correlationId) {
          proxyRes.headers['x-correlation-id'] = correlationId;
        }
      },
      error: (err: any, req: any, res: any) => {
        console.error(`Proxy error for ${serviceName}:`, err);

        // Record failure in circuit breaker
        breaker.fire(() => Promise.reject(err)).catch(() => { });

        if (!res.headersSent) {
          res.status(503).json({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: `${serviceName} is currently unavailable`,
            },
          });
        }

        if (serviceConfig.onError) {
          serviceConfig.onError(err, req, res);
        }
      },
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    // Check circuit breaker state
    if (breaker.opened) {
      return res.status(503).json({
        error: {
          code: 'CIRCUIT_BREAKER_OPEN',
          message: `${serviceName} is temporarily unavailable`,
        },
      });
    }

    // Execute proxy with circuit breaker protection
    breaker.fire(() => {
      return new Promise<void>((resolve, reject) => {
        proxyMiddleware(req, res, (err?: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }).catch((err) => {
      if (!res.headersSent) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `${serviceName} is temporarily unavailable`,
          },
        });
      }
    });
  };
}

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  });
});

// Authentication Service Routes (public endpoints don't require auth)
router.use(
  '/auth',
  authRateLimiter,
  createServiceProxy(
    {
      target: config.services.auth,
      pathRewrite: { '^/api/v1/auth': '' },
    },
    'auth-service'
  )
);

// Profile Service Routes (requires authentication)
router.use(
  '/profile',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.profile,
      pathRewrite: { '^/api/v1/profile': '/api' },
    },
    'profile-service'
  )
);

// Appointment Service Routes (requires authentication)
router.use(
  '/appointments',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.appointment,
      pathRewrite: { '^/api/v1/appointments': '/api/appointments' },
    },
    'appointment-service'
  )
);

router.use(
  '/slots',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.appointment,
      pathRewrite: { '^/api/v1/slots': '/api/slots' },
    },
    'appointment-service'
  )
);

// Consultation Service Routes (requires authentication)
router.use(
  '/consultations',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.consultation,
      pathRewrite: { '^/api/v1/consultations': '/api/consultations' },
    },
    'consultation-service'
  )
);

// Video & Chat Service Routes (requires authentication)
router.use(
  '/video',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.videoChat,
      pathRewrite: { '^/api/v1/video': '/api' },
    },
    'video-chat-service'
  )
);

// Payment Service Routes (requires authentication)
router.use(
  '/payments',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.payment,
      pathRewrite: { '^/api/v1/payments': '/api/payments' },
    },
    'payment-service'
  )
);

// Insurance Service Routes (requires authentication)
router.use(
  '/insurance',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.payment,
      pathRewrite: { '^/api/v1/insurance': '/api/insurance' },
    },
    'payment-insurance-service'
  )
);

// Cerner FHIR Integration Routes (requires authentication)
router.use(
  '/fhir',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.payment,
      pathRewrite: { '^/api/v1/fhir': '/api/fhir' },
    },
    'cerner-fhir-service'
  )
);

// Medical Records Service Routes (requires authentication)
router.use(
  '/prescriptions',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.medicalRecords,
      pathRewrite: { '^/api/v1/prescriptions': '/api/prescriptions' },
    },
    'medical-records-service'
  )
);

router.use(
  '/documents',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.medicalRecords,
      pathRewrite: { '^/api/v1/documents': '/api/documents' },
    },
    'medical-records-service'
  )
);

// Notification Service Routes (requires authentication, internal use)
router.use(
  '/notifications',
  authenticateJWT,
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.notification,
      pathRewrite: { '^/api/v1/notifications': '/api/notifications' },
    },
    'notification-service'
  )
);

// Hospital Admin Service Routes (requires hospital admin role)
router.use(
  '/hospital',
  authenticateJWT,
  authorize('HOSPITAL_ADMIN', 'SUPER_ADMIN'),
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.hospitalAdmin,
      pathRewrite: { '^/api/v1/hospital': '/api' },
    },
    'hospital-admin-service'
  )
);

// Super Admin Service Routes (requires super admin role)
router.use(
  '/admin',
  authenticateJWT,
  authorize('SUPER_ADMIN'),
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.superAdmin,
      pathRewrite: { '^/api/v1/admin': '/api/super-admins' },
    },
    'super-admin-service'
  )
);

// Audit Service Routes (requires authentication, mainly for internal use)
router.use(
  '/audit',
  authenticateJWT,
  authorize('SUPER_ADMIN', 'HOSPITAL_ADMIN'),
  userRateLimiter,
  createServiceProxy(
    {
      target: config.services.audit,
      pathRewrite: { '^/api/v1/audit': '/api' },
    },
    'audit-service'
  )
);

export default router;

