import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config';

// JWKS client for token verification
const client = jwksClient({
  jwksUri: config.jwt.jwksUri,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    callback(err, signingKey);
  });
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    email: string;
    tenantId?: string;
  };
}

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and extracts user information
 */
export const authenticateJWT = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const internalSecret = req.headers['x-internal-secret'];

    // Bypass authentication for internal service calls
    if (internalSecret && internalSecret === config.internalSecret) {
      return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token using JWKS (for RS256) or secret (for HS256)
    const decoded = await new Promise<any>((resolve, reject) => {
      if (config.jwt.jwksUri) {
        // RS256 - verify using JWKS
        jwt.verify(
          token,
          getKey,
          {
            audience: config.jwt.audience,
            issuer: config.jwt.issuer,
            algorithms: ['RS256'],
          },
          (err, decoded) => {
            if (err) reject(err);
            else resolve(decoded);
          }
        );
      } else {
        // HS256 - verify using secret
        jwt.verify(
          token,
          config.jwt.secret,
          {
            audience: config.jwt.audience,
            issuer: config.jwt.issuer,
            algorithms: ['HS256'],
          },
          (err, decoded) => {
            if (err) reject(err);
            else resolve(decoded);
          }
        );
      }
    });

    // Extract user information from token
    req.user = {
      userId: decoded.sub || decoded.userId,
      role: decoded.role,
      email: decoded.email,
      tenantId: decoded.tenantId, // Multi-tenant support
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        details: error.message,
      },
    });
  }
};

/**
 * Optional authentication - doesn't fail if token is missing
 * Useful for public endpoints that can work with or without auth
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token, continue without user
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  try {
    await authenticateJWT(req, res, next);
  } catch {
    // If auth fails, continue without user
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    next();
  };
};

