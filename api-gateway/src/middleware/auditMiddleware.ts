import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Correlation ID middleware.
 * Attaches unique correlation ID to all incoming requests and response headers.
 * Raw HTTP_REQUEST / HTTP_RESPONSE traffic logging to audit collection is disabled
 * so the compliance audit trail only contains meaningful structured business events.
 */
export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = uuidv4();
  
  // Attach correlation ID to request and response
  (req as any).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};
