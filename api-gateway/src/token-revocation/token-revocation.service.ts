import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { createHash } from 'crypto';

/**
 * Token Revocation Service
 * Manages token blacklist using Redis
 * Tokens are hashed before storage for security
 */
@Injectable()
export class TokenRevocationService {
  private readonly BLACKLIST_PREFIX = 'token:revoked:';
  private readonly TTL_SECONDS = 86400; // 24 hours (adjust based on token expiry)

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if token is revoked
   */
  async isRevoked(token: string): Promise<boolean> {
    if (!token) {
      return true;
    }

    const tokenHash = this.hashToken(token);
    const key = `${this.BLACKLIST_PREFIX}${tokenHash}`;

    const exists = await this.redisService.exists(key);
    return exists === 1;
  }

  /**
   * Revoke a token (add to blacklist)
   * Called by auth-service when user logs out or token is invalidated
   */
  async revokeToken(token: string, ttlSeconds?: number): Promise<void> {
    if (!token) {
      return;
    }

    const tokenHash = this.hashToken(token);
    const key = `${this.BLACKLIST_PREFIX}${tokenHash}`;
    const ttl = ttlSeconds || this.TTL_SECONDS;

    await this.redisService.setex(key, ttl, '1');
  }

  /**
   * Remove token from blacklist (for testing/admin purposes)
   */
  async unrevokeToken(token: string): Promise<void> {
    if (!token) {
      return;
    }

    const tokenHash = this.hashToken(token);
    const key = `${this.BLACKLIST_PREFIX}${tokenHash}`;

    await this.redisService.del(key);
  }

  /**
   * Hash token for storage (SHA-256)
   * Never store full tokens in Redis
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

