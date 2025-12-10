import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface RawCredentials {
  username: string;
  password: string;
}

interface GeneratedCredentials {
  raw: RawCredentials;
  encrypted: string;
}

export interface ClusterCredentials {
  username: string;
  password: string;
  connectionString: string;
}

@Injectable()
export class CredentialsService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly authTagLength = 16;

  constructor(private readonly configService: ConfigService) {}

  async generateCredentials(): Promise<GeneratedCredentials> {
    const username = 'admin';
    const password = this.generateSecurePassword(24);

    const raw: RawCredentials = { username, password };
    const encrypted = this.encrypt(JSON.stringify(raw));

    return { raw, encrypted };
  }

  async decryptCredentials(encrypted: string): Promise<RawCredentials> {
    const decrypted = this.decrypt(encrypted);
    return JSON.parse(decrypted) as RawCredentials;
  }

  async getDecrypted(clusterId: string): Promise<ClusterCredentials> {
    // In development, return local MongoDB credentials
    const isDev = this.configService.get<string>('NODE_ENV') === 'development';
    
    if (isDev) {
      const mongoUri = this.configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017');
      return {
        username: 'admin',
        password: 'admin',
        connectionString: mongoUri,
      };
    }

    // TODO: In production, this would retrieve from cluster metadata
    throw new Error('Production credential retrieval not implemented');
  }

  private encrypt(text: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv + authTag + encrypted data
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const key = this.getEncryptionKey();
    
    // Extract iv, authTag, and encrypted data
    const iv = Buffer.from(encryptedData.slice(0, this.ivLength * 2), 'hex');
    const authTag = Buffer.from(
      encryptedData.slice(this.ivLength * 2, (this.ivLength + this.authTagLength) * 2),
      'hex',
    );
    const encrypted = encryptedData.slice((this.ivLength + this.authTagLength) * 2);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private getEncryptionKey(): Buffer {
    const keyString = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');
    if (!keyString || keyString.length < this.keyLength) {
      // In development, generate a consistent key from a default value
      return crypto.scryptSync('development-key-do-not-use-in-production', 'salt', this.keyLength);
    }
    return crypto.scryptSync(keyString, 'eutlas-credentials', this.keyLength);
  }

  private generateSecurePassword(length: number): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }
    
    return password;
  }
}

