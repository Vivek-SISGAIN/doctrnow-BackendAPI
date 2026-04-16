import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { Observable } from 'rxjs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface JwtPayload {
  sub?: string;
  userId?: string;
  role?: string;
  tenantId?: string;
  exp?: number;
  iat?: number;
}

interface NormalizedUser {
  userId: string;
  sub: string;
  role: string;
  tenantId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode JWT payload WITHOUT signature or expiry verification.
 * DEV-ONLY — never use this in production paths.
 *
 * Returns the parsed payload or null if the token is malformed.
 */
function decodeJwtPayloadUnsafe(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const raw = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(raw) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extract the Bearer token string from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Build a normalised user object from a decoded JWT payload.
 * Returns null if a userId cannot be derived.
 */
function buildUserFromPayload(payload: JwtPayload): NormalizedUser | null {
  const userId = payload.userId ?? payload.sub;
  if (!userId) return null;

  return {
    userId,
    sub: userId,
    role: payload.role ?? 'USER',
    tenantId: payload.tenantId ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Routes that are ALWAYS public — no token required, even in production.
 * Uses exact substring matching against the request path.
 */
const ALWAYS_PUBLIC_PATHS: { method: string; pattern: RegExp }[] = [
  // GET /profiles/specialties  — list all specialties
  { method: 'GET', pattern: /profiles\/specialties/ },
  // GET /profiles/doctors       — list doctors (NOT a single doctor detail)
  { method: 'GET', pattern: /profiles\/doctors(?!\/[^/]+$)/ },
];

/**
 * Routes that participate in dev-mode unsafe-decode bypass.
 * In production these fall through to strict Passport/JWKS validation.
 */
const DEV_BYPASSABLE_PATH_SEGMENTS = [
  '/appointments',
  '/prescriptions',
  '/documents',
  '/consultations',
  '/consultation-notes',
  '/lab-reports',
  '/hospital',
  '/profiles',
  '/super-admins',
  '/chat',
  '/search',
  '/agora',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JwtAuthGuard — three-tier authentication strategy
 *
 * Tier 1 — Truly Public
 *   Specific routes are open to everyone with no token required.
 *
 * Tier 2 — Dev Relaxed Mode  (SKIP_APPOINTMENT_AUTH=true, non-production only)
 *   JWT expiry is NOT enforced. The token is decoded without JWKS verification
 *   so expired tokens are accepted. Useful during local/staging development
 *   when the auth-service is unavailable or tokens expire frequently.
 *
 *   Behaviour by token state:
 *     ┌──────────────────────────────┬──────────────────────────────────────┐
 *     │ Token state                  │ Result                               │
 *     ├──────────────────────────────┼──────────────────────────────────────┤
 *     │ Valid / expired but readable │ request.user populated, passes       │
 *     │ Present but unreadable       │ 401 — fail loudly                    │
 *     │ Absent                       │ request.user = dev-anonymous, passes │
 *     └──────────────────────────────┴──────────────────────────────────────┘
 *
 * Tier 3 — Strict Mode  (production / SKIP_APPOINTMENT_AUTH=false)
 *   Full Passport JWT strategy: RS256 signature + JWKS + exp enforcement.
 *   Expired token → 401 → frontend calls /auth/refresh → retries.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // canActivate
  // ───────────────────────────────────────────────────────────────────────────

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();

    // ── Allow CORS preflight unconditionally ──────────────────────────────────
    // Browsers send OPTIONS without an Authorization header; blocking here
    // would break every credentialed cross-origin request.
    if (request?.method === 'OPTIONS') {
      return true;
    }

    // ── @Public() decorator ──────────────────────────────────────────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // ── Internal Service Bypass ──────────────────────────────────────────────
    // Allows microservices to call each other through the gateway using a secret key.
    const internalKey = request?.headers?.['x-internal-service-key'];
    const internalSecret = this.configService.get<string>('INTERNAL_SERVICE_SECRET');

    if (internalKey && internalSecret && internalKey === internalSecret) {
      this.logger.debug(`Internal service authenticated bypass for ${request.url}`);
      request.user = {
        userId: 'internal-service',
        sub: 'internal-service',
        role: 'SUPER_ADMIN', // Give internal services high privileges on proxied routes
        tenantId: null,
      };
      return true;
    }

    const rawPath = (
      request?.url ??
      request?.originalUrl ??
      request?.path ??
      ''
    ).split('?')[0];

    const method = (request?.method ?? '').toUpperCase();

    // ── Tier 1: Always-public routes ─────────────────────────────────────────
    const isAlwaysPublic = ALWAYS_PUBLIC_PATHS.some(
      (rule) => rule.method === method && rule.pattern.test(rawPath),
    );
    if (isAlwaysPublic) return true;

    // ── Tier 2: Dev relaxed mode ─────────────────────────────────────────────
    const rawValue = this.configService.get('SKIP_APPOINTMENT_AUTH');
    const isDevBypassEnabled = rawValue === true || rawValue === 'true';

    if (isDevBypassEnabled) {
      return this.handleDevMode(request, rawPath);
    }

    // ── Tier 3: Strict Passport / JWKS validation ────────────────────────────
    return super.canActivate(context);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // handleRequest  (called by Passport after strict validation)
  // ───────────────────────────────────────────────────────────────────────────

  handleRequest<T = NormalizedUser>(err: Error | null, user: T, info: { message?: string } | null): T {
    if (err || !user) {
      // Throw UnauthorizedException — NOT a plain Error.
      // This ensures the response is a proper 401 JSON that the frontend
      // interceptor can detect and use to trigger a token refresh.
      throw err ?? new UnauthorizedException(info?.message ?? 'Unauthorized');
    }
    return user;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Dev-mode gate.
   *
   * Only operates on paths in DEV_BYPASSABLE_PATH_SEGMENTS.
   * Everything else falls through to strict validation even when the flag is on,
   * so auth-service routes (/auth/*) always stay fully protected.
   */
  private handleDevMode(
    request: Record<string, any>,
    path: string,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isBypassablePath = DEV_BYPASSABLE_PATH_SEGMENTS.some((segment) =>
      path.includes(segment),
    );

    if (!isBypassablePath) {
      // Not a bypassable path — enforce strict validation even in dev
      // (e.g. /auth/login, /auth/refresh themselves must stay strict).
      return super.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any);
    }

    const token = extractBearerToken(request?.headers?.authorization);

    // ── No token present ─────────────────────────────────────────────────────
    if (!token) {
      this.logger.warn(
        `[DEV] No token on ${path} — attaching dev-anonymous user`,
      );
      request.user = this.buildDevAnonymousUser();
      return true;
    }

    // ── Token present — decode without verification ──────────────────────────
    const payload = decodeJwtPayloadUnsafe(token);

    if (!payload) {
      // Token exists but is structurally broken (not a valid JWT).
      // Fail loudly so the developer knows something is wrong.
      this.logger.error(
        `[DEV] Token on ${path} is present but unreadable — rejecting`,
      );
      throw new UnauthorizedException(
        'Dev mode: Authorization token is present but could not be decoded. ' +
        'Ensure you are sending a valid JWT (even if expired).',
      );
    }

    const user = buildUserFromPayload(payload);

    if (!user) {
      // Payload decoded but has no identifiable userId / sub.
      this.logger.error(
        `[DEV] Token on ${path} decoded but contains no userId/sub — rejecting`,
      );
      throw new UnauthorizedException(
        'Dev mode: Token payload does not contain a userId or sub claim.',
      );
    }

    this.logger.debug(
      `[DEV] Unsafe-decoded user ${user.userId} (role: ${user.role}) on ${path}`,
    );
    request.user = user;
    return true;
  }

  /**
   * Fallback identity used in dev when no token is provided at all.
   * Gives downstream controllers a safe non-null user so they don't crash.
   */
  private buildDevAnonymousUser(): NormalizedUser {
    return {
      userId: 'dev-anonymous',
      sub: 'dev-anonymous',
      role: 'USER',
      tenantId: null,
    };
  }
}