import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtKeyService } from './jwt-key.service';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { importSPKI, jwtVerify } from 'jose';

export interface JwtPayload {
  sub: string; // User ID
  tenantId: string;
  role: string;
  sessionId: string;
  iss: string;
  aud: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * JWT Service
 * Handles JWT token generation and signing
 */
@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);

  constructor(
    private readonly jwtKeyService: JwtKeyService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Generate access token (short-lived, RS256)
   */
  async generateAccessToken(
    userId: string,
    tenantId: string,
    role: string,
    sessionId: string,
  ): Promise<string> {
    const keyPair = await this.jwtKeyService.getCurrentKeyPair();
    const issuer = this.configService.get<string>('JWT_ISSUER', 'doctornow-platform');
    const audience = this.configService.get<string>('JWT_AUDIENCE', 'doctornow-api');
    // const ttl = this.configService.get<number>('JWT_ACCESS_TOKEN_TTL', 900); // 15 minutes
    const ttl = Number(this.configService.get<number>('JWT_ACCESS_TOKEN_TTL', 900));
    const issuedAt = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = {
      sub: userId,
      tenantId,
      role,
      sessionId,
      iss: issuer,
      aud: audience,
      iat: issuedAt,
      exp: issuedAt + ttl,
    };

    const token = jwt.sign(payload, keyPair.privateKey, {
      algorithm: 'RS256',
      keyid: keyPair.keyId,
    });

    return token;
  }

  /**
   * Generate refresh token (long-lived, stored hashed)
   */
  async generateRefreshToken(): Promise<{ token: string; hash: string }> {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(token);

    return { token, hash };
  }

  /**
   * Hash token for storage (SHA-256)
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate token pair (access + refresh)
   */
  async generateTokenPair(
    userId: string,
    tenantId: string,
    role: string,
    sessionId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.generateAccessToken(userId, tenantId, role, sessionId);
    const { token: refreshToken } = await this.generateRefreshToken();
    const expiresIn = this.configService.get<number>('JWT_ACCESS_TOKEN_TTL', 900);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Verify token (used for refresh token validation)
   * Note: Access tokens are validated at API Gateway using JWKS
   */
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const issuer = this.configService.get<string>('JWT_ISSUER', 'doctornow-platform');
      const audience = this.configService.get<string>('JWT_AUDIENCE', 'doctornow-api');

      // Decode token to get key ID
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        return null;
      }

      const keyId = (decoded.header as any).kid;
      const keys = await this.jwtKeyService.getActiveKeys();
      const key = keys.find((k) => k.keyId === keyId);

      if (!key) {
        this.logger.warn(`Key not found for kid: ${keyId}`);
        return null;
      }

      // Import public key using jose for verification
      const publicKey = await importSPKI(key.publicKey, 'RS256');
      const { payload } = await jwtVerify(token, publicKey, {
        issuer,
        audience,
      });

      // Map jose payload to our JwtPayload interface
      const jwtPayload: JwtPayload = {
        sub: payload.sub as string,
        tenantId: (payload as any).tenantId || '',
        role: (payload as any).role || '',
        sessionId: (payload as any).sessionId || '',
        iss: payload.iss || issuer,
        aud: Array.isArray(payload.aud) ? payload.aud[0] : (payload.aud as string) || audience,
        iat: payload.iat,
        exp: payload.exp,
      };

      return jwtPayload;
    } catch (error) {
      this.logger.warn(`Token verification failed: ${error}`);
      return null;
    }
  }
}

