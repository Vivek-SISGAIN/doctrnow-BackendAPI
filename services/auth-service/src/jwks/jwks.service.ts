import { Injectable } from '@nestjs/common';
import { JwtKeyService } from '../jwt/jwt-key.service';
import { importSPKI, exportJWK } from 'jose';

export interface JWK {
  kty: string;
  use: string;
  kid: string;
  n: string;
  e: string;
  alg: string;
}

export interface JWKS {
  keys: JWK[];
}

/**
 * JWKS Service
 * Generates JWKS (JSON Web Key Set) for public key distribution
 */
@Injectable()
export class JwksService {
  constructor(private readonly jwtKeyService: JwtKeyService) {}

  /**
   * Generate JWKS from active public keys
   */
  async generateJWKS(): Promise<JWKS> {
    const activeKeys = await this.jwtKeyService.getActiveKeys();
    const keys: JWK[] = [];

    for (const key of activeKeys) {
      try {
        // Convert PEM to JWK format
        const publicKey = await importSPKI(key.publicKey, 'RS256');
        const jwk = await exportJWK(publicKey);

        keys.push({
          kty: jwk.kty || 'RSA',
          use: 'sig',
          kid: key.keyId,
          n: jwk.n || '',
          e: jwk.e || '',
          alg: 'RS256',
        });
      } catch (error) {
        // Skip invalid keys
        continue;
      }
    }

    return { keys };
  }
}

