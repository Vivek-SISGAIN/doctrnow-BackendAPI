import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { generateKeyPairSync, createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface JwtKeyPair {
  keyId: string;
  publicKey: string;
  privateKey: string;
}

/**
 * JWT Key Service
 * Manages RS256 key pairs for JWT signing
 * Supports key rotation and JWKS endpoint
 */
@Injectable()
export class JwtKeyService implements OnModuleInit {
  private readonly logger = new Logger(JwtKeyService.name);
  private currentKeyId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Ensure at least one active key exists
    await this.ensureActiveKey();
  }

  /**
   * Generate a new RSA key pair
   */
  private generateKeyPair(): JwtKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    // Generate key ID (kid) from public key hash
    const keyId = createHash('sha256').update(publicKey).digest('hex').substring(0, 16);

    return {
      keyId,
      publicKey,
      privateKey,
    };
  }

  /**
   * Encrypt private key at rest (simple implementation - use proper encryption in production)
   */
  private encryptPrivateKey(privateKey: string): string {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      this.logger.warn('ENCRYPTION_KEY not set, storing private key unencrypted (NOT FOR PRODUCTION)');
      return privateKey;
    }
    // TODO: Implement proper encryption (AES-256-GCM)
    return privateKey;
  }

  /**
   * Decrypt private key
   */
  private decryptPrivateKey(encryptedKey: string): string {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      return encryptedKey;
    }
    // TODO: Implement proper decryption
    return encryptedKey;
  }

  /**
   * Ensure at least one active key exists
   */
  async ensureActiveKey(): Promise<void> {
    const activeKey = await this.prisma.jwtKey.findFirst({
      where: { isActive: true },
    });

    if (!activeKey) {
      this.logger.log('No active key found, generating new key pair...');
      await this.generateAndStoreKey();
    } else {
      this.currentKeyId = activeKey.keyId;
      this.logger.log(`Active key found: ${activeKey.keyId}`);
    }
  }

  /**
   * Generate and store a new key pair
   */
  async generateAndStoreKey(): Promise<JwtKeyPair> {
    const keyPair = this.generateKeyPair();
    const encryptedPrivateKey = this.encryptPrivateKey(keyPair.privateKey);

    await this.prisma.jwtKey.create({
      data: {
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        privateKey: encryptedPrivateKey,
        isActive: true,
      },
    });

    this.currentKeyId = keyPair.keyId;
    this.logger.log(`New key pair generated and stored: ${keyPair.keyId}`);

    return keyPair;
  }

  /**
   * Get current active key pair
   */
  async getCurrentKeyPair(): Promise<JwtKeyPair> {
    if (!this.currentKeyId) {
      await this.ensureActiveKey();
    }

    const key = await this.prisma.jwtKey.findUnique({
      where: { keyId: this.currentKeyId! },
    });

    if (!key) {
      throw new Error('Active key not found');
    }

    return {
      keyId: key.keyId,
      publicKey: key.publicKey,
      privateKey: this.decryptPrivateKey(key.privateKey),
    };
  }

  /**
   * Get all active keys for JWKS endpoint
   */
  async getActiveKeys(): Promise<Array<{ keyId: string; publicKey: string }>> {
    const keys = await this.prisma.jwtKey.findMany({
      where: { isActive: true },
      select: {
        keyId: true,
        publicKey: true,
      },
    });

    return keys;
  }

  /**
   * Rotate keys (generate new, keep old active until expiry)
   */
  async rotateKeys(): Promise<JwtKeyPair> {
    this.logger.log('Rotating JWT keys...');
    return this.generateAndStoreKey();
  }

  /**
   * Deactivate old keys (called after token expiry period)
   */
  async deactivateOldKeys(keepActiveCount: number = 2): Promise<void> {
    const keys = await this.prisma.jwtKey.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (keys.length > keepActiveCount) {
      const keysToDeactivate = keys.slice(keepActiveCount);
      await this.prisma.jwtKey.updateMany({
        where: {
          keyId: {
            in: keysToDeactivate.map((k) => k.keyId),
          },
        },
        data: { isActive: false },
      });

      this.logger.log(`Deactivated ${keysToDeactivate.length} old keys`);
    }
  }
}

