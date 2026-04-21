import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { auditPublisher } from '../services/auditPublisher';

export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const correlationId = uuidv4();
  
  // Attach correlation ID to request and response
  (req as any).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  
  let userId, userRole;
  if ((req as any).user) {
    userId = (req as any).user.id || (req as any).user.sub;
    userRole = (req as any).user.role;
  }

  // 1. Publish REQUEST event
  auditPublisher({
    eventId: correlationId,
    timestamp: new Date().toISOString(),
    action: 'HTTP_REQUEST',
    method: req.method,
    path: req.path,
    fullUrl,
    ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown',
    userAgent: req.headers['user-agent'],
    requestBody: req.body,
    userId,
    userRole,
  });

  // Intercept response to capture response body if needed, and definitely status code and time
  const originalJson = res.json;
  const originalSend = res.send;

  let responseSent = false;
  
  const finishAudit = (errorMessage?: string) => {
    if (responseSent) return;
    responseSent = true;
    
    const responseTimeMs = Date.now() - startTime;
    
    // 2. Publish RESPONSE event
    auditPublisher({
      eventId: correlationId,
      timestamp: new Date().toISOString(),
      action: 'HTTP_RESPONSE',
      method: req.method,
      path: req.path,
      fullUrl,
      statusCode: res.statusCode,
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown',
      userAgent: req.headers['user-agent'],
      userId,
      userRole,
      responseTimeMs,
      errorMessage,
    });
  };

  res.on('finish', () => {
    finishAudit(res.statusCode >= 400 ? res.statusMessage || `Error ${res.statusCode}` : undefined);
  });

  next();
};
