import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark routes as public (skip JWT authentication)
 * Use sparingly - only for health checks and public auth endpoints
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

