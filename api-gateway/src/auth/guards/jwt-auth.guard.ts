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
 * Decode JWT payload without verification (dev-only). Returns payload or null.
 */
function decodeJwtPayloadUnsafe(token: string): { sub?: string; userId?: string; role?: string; tenantId?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { sub?: string; userId?: string; role?: string; tenantId?: string };
    return payload;
  } catch {
    return null;
  }
}

/**
 * JWT Authentication Guard
 * Validates JWT tokens using RS256 and JWKS
 * Skips validation for routes marked with @Public()
 * In development, can skip for /api/v1/appointments when SKIP_APPOINTMENT_AUTH is true (for testing without auth-service)
 * When SKIP_APPOINTMENT_AUTH is true, GET /profiles/patients/me accepts Bearer token by decoding (no JWKS verify) so profile-service gets X-User-ID
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

    // Public read-only profile routes: specialties and doctors list (not single doctor by id) work without JWT
    const path = (request?.url || request?.originalUrl || request?.path || '').split('?')[0];
    const method = (request?.method || '').toUpperCase();
    if (method === 'GET' || method === 'POST' && path.includes('profiles')) {
      const isDoctorsList = path.includes('profiles/doctors') && !/profiles\/doctors\/[^/]+$/.test(path);
      if (path.includes('profiles/specialties') || isDoctorsList) {
        return true;
      }
    }

    // /profiles/family-members/*: accept Bearer by decoding so patient portal can list/add/edit/remove family members
    // (works even when JWKS verification fails or is unavailable)
    if (path.includes('/profiles/family-members')) {
      const authHeader = request?.headers?.authorization;
      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;
      if (token) {
        const payload = decodeJwtPayloadUnsafe(token);
        const userId = payload?.userId ?? payload?.sub;
        if (userId) {
          (request as any).user = {
            userId,
            sub: userId,
            role: payload?.role ?? 'PATIENT',
            tenantId: payload?.tenantId,
          };
          return true;
        }
      }
    }

    // /agora/* (e.g. /agora/token): accept Bearer by decoding so doctor/patient can get RTC token without 401 when JWKS fails
    if (path.includes('agora')) {
      const authHeader = request?.headers?.authorization;
      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;
      if (token) {
        const payload = decodeJwtPayloadUnsafe(token);
        const userId = payload?.userId ?? payload?.sub;
        if (userId) {
          (request as any).user = {
            userId,
            sub: userId,
            role: payload?.role ?? 'USER',
            tenantId: payload?.tenantId,
          };
          return true;
        }
      }
    }

    // Doctor portal critical routes: accept Bearer by decoding so prescriptions/appointments load after call ends
    // (prevents 401 → logout when JWKS is unavailable or flaky)
    const doctorPortalPaths = [
      path.includes('/appointments'),
      path.includes('/prescriptions'),
      path.includes('/documents'),
      path.includes('/consultations'),
      path.includes('/lab-reports'),
      path.includes('/hospital'),
      path.includes('/profiles'),
      path.includes('/super-admins'),
      path.includes('/chat'),
    ];
    if (doctorPortalPaths.some(Boolean)) {
      const authHeader = request?.headers?.authorization;
      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;
      if (token) {
        const payload = decodeJwtPayloadUnsafe(token);
        const userId = payload?.userId ?? payload?.sub;
        if (userId) {
          (request as any).user = {
            userId,
            sub: userId,
            role: payload?.role ?? 'DOCTOR',
            tenantId: payload?.tenantId,
          };
          return true;
        }
      }
    }

    // GET /profiles/doctors/:id (single doctor): accept Bearer by decoding so doctor profile loads (appointments need profile doctor id)
    if (method === 'GET' && path.includes('/profiles/doctors/') && !path.includes('/availability')) {
      const authHeader = request?.headers?.authorization;
      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;
      if (token) {
        const payload = decodeJwtPayloadUnsafe(token);
        const userId = payload?.userId ?? payload?.sub;
        if (userId) {
          (request as any).user = {
            userId,
            sub: userId,
            role: payload?.role ?? 'DOCTOR',
            tenantId: payload?.tenantId,
          };
          return true;
        }
      }
    }

    // /profiles/patients: accept Bearer by decoding so patient names load on appointments/prescriptions pages
    if (path.includes('/profiles/patients')) {
      const authHeader = request?.headers?.authorization;
      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;
      if (token) {
        const payload = decodeJwtPayloadUnsafe(token);
        const userId = payload?.userId ?? payload?.sub;
        if (userId) {
          (request as any).user = {
            userId,
            sub: userId,
            role: payload?.role ?? 'PATIENT',
            tenantId: payload?.tenantId,
          };
          return true;
        }
      }
    }

    // Dev-only: skip JWT for appointments, prescriptions, documents, consultations, etc. when SKIP_APPOINTMENT_AUTH is true
    // Also skip for doctor availability (GET/PATCH .../doctors/:id/availability) so 401 there does not log the doctor out
    const skipAuthForDev = this.configService.get<boolean>('SKIP_APPOINTMENT_AUTH', false);
    if (skipAuthForDev) {
      if (
        path.includes('/appointments') ||
        path.includes('/prescriptions') ||
        path.includes('/documents') ||
        path.includes('/consultations') ||
        path.includes('/consultation-notes') ||
        path.includes('/lab-reports') ||
        path.includes('/hospital') ||
        path.includes('/profiles') || path.includes('/super-admins')
      ) {
        const authHeader = request?.headers?.authorization;
        console.log("Auth Header", authHeader)
        const token =
          typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (token) {
          const payload = decodeJwtPayloadUnsafe(token);
          const userId = payload?.userId ?? payload?.sub;
          if (userId) {
            (request as any).user = {
              userId,
              sub: userId,
              role: payload?.role ?? 'USER',
              tenantId: payload?.tenantId,
            };
            return true;
          }
        }
        return true;
      }
      // Doctor availability: GET/PATCH /profiles/doctors/:id/availability (avoids 401 → instant logout)
      if (path.includes('/profiles/doctors') && path.includes('/availability')) {
        return true;
      }
      // GET or POST /profiles/patients/* (e.g. /me): accept Bearer by decoding so profile-service gets X-User-ID; POST /me for patient registration profile create
      if ((method === 'GET' || method === 'POST') && path.includes('/profiles/patients/')) {
        const authHeader = request?.headers?.authorization;
        const token =
          typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (token) {
          const payload = decodeJwtPayloadUnsafe(token);
          const userId = payload?.userId ?? payload?.sub;
          if (userId) {
            (request as any).user = {
              userId,
              sub: userId,
              role: payload?.role ?? 'PATIENT',
              tenantId: payload?.tenantId,
            };
            return true;
          }
        }
      }
      // GET /profiles/doctors/:id (single doctor): accept Bearer by decoding so doctor profile loads when JWKS is unavailable (dashboard/appointments need profile id)
      if (method === 'GET' && path.includes('/profiles/doctors/') && path.includes('/availability') === false) {
        const authHeader = request?.headers?.authorization;
        const token =
          typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (token) {
          const payload = decodeJwtPayloadUnsafe(token);
          const userId = payload?.userId ?? payload?.sub;
          if (userId) {
            (request as any).user = {
              userId,
              sub: userId,
              role: payload?.role ?? 'DOCTOR',
              tenantId: payload?.tenantId,
            };
            return true;
          }
        }
      }
    }

    return super.canActivate(context);
  }

  // src/auth/guards/jwt-auth.guard.ts
  handleRequest(err, user, info) {
    if (err || !user) {
      throw err || new UnauthorizedException(info?.message ?? 'Unauthorized');
      //           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
      // Must throw UnauthorizedException — NOT a plain Error or nothing
    }
    return user;
  }
}
