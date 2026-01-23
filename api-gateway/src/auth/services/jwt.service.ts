import { Injectable } from '@nestjs/common';
import { TokenRevocationService } from '../../token-revocation/token-revocation.service';

/**
 * JWT Service
 * Handles JWT validation logic and token revocation checks
 * Note: Actual token validation is done in JwtStrategy
 */
@Injectable()
export class JwtService {
  constructor(
    private readonly tokenRevocationService: TokenRevocationService,
  ) {}

  /**
   * Check if token is revoked (blacklisted)
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    if (!token) {
      return true; // No token = effectively revoked
    }

    return this.tokenRevocationService.isRevoked(token);
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }
}

