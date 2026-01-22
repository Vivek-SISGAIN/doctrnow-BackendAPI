import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Correlation ID middleware
 * Adds a unique correlation ID to each request for tracing
 */
export const correlationId = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  
  // Add to request
  (req as any).id = correlationId;
  req.headers['x-correlation-id'] = correlationId as string;
  
  // Add to response headers
  res.setHeader('x-correlation-id', correlationId);
  
  next();
};

