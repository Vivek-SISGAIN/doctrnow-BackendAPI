import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { JwtService } from '../services/jwt.service';

export interface JwtPayload {
  sub: string;
  userId?: string;
  email: string;
  role: string;
  tenantId?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    const jwksUri = configService.get<string>('JWT_JWKS_URI');
    const issuer = configService.get<string>('JWT_ISSUER');
    const audience = configService.get<string>('JWT_AUDIENCE');

    if (!jwksUri) {
      throw new Error('JWT_JWKS_URI is required for RS256 JWT validation');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
        cacheMaxAge: 86400000, // 24 hours
      }),
      issuer,
      audience,
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload): Promise<JwtPayload> {
    if (!payload) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Extract token from request for revocation check
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Check token revocation (blacklist)
    const isRevoked = await this.jwtService.isTokenRevoked(token);
    if (isRevoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Normalize user ID (some tokens use 'sub', others use 'userId')
    const userId = payload.userId || payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Token missing user identifier');
    }

    // Validate required claims
    if (!payload.role) {
      throw new UnauthorizedException('Token missing role claim');
    }

    // Return normalized payload
    return {
      ...payload,
      userId,
      sub: userId,
    };
  }
}

