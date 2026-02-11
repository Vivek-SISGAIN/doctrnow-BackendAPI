import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * JWT Authentication Guard
 * Validates JWT tokens using RS256 and JWKS
 * Skips validation for routes marked with @Public()
 * In development, can skip for /api/v1/appointments when SKIP_APPOINTMENT_AUTH is true (for testing without auth-service)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // Allow OPTIONS (CORS preflight) without auth - browser does not send Authorization on preflight
    if (request?.method === 'OPTIONS') {
      return true;
    }

    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Dev-only: skip JWT for appointments, prescriptions, documents, profiles, consultations when SKIP_APPOINTMENT_AUTH is true
    // (avoids 401 on these routes so doctor portal can call them without token validation issues)
    const skipAuthForDev = this.configService.get<boolean>('SKIP_APPOINTMENT_AUTH', false);
    if (skipAuthForDev) {
      const path = (request?.url || request?.originalUrl || '').split('?')[0];
      if (
        path.includes('/appointments') ||
        path.includes('/prescriptions') ||
        path.includes('/documents') ||
        path.includes('/profiles') ||
        path.includes('/consultations') ||
        path.includes('/lab-reports')
      ) {
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}

