import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        userId: string;
        role: string;
        email: string;
        tenantId?: string;
      };
    }
  }
}

export {};

