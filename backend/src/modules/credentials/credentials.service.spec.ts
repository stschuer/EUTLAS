import { CredentialsService } from './credentials.service';
import { ConfigService } from '@nestjs/config';

describe('CredentialsService', () => {
  let service: CredentialsService;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'CREDENTIALS_ENCRYPTION_KEY') return null; // triggers dev key
        if (key === 'MONGODB_URI') return defaultValue || 'mongodb://localhost:27017';
        return defaultValue;
      }),
    } as any;

    service = new CredentialsService(configService);
  });

  // ==================== Credential generation ====================

  describe('generateCredentials', () => {
    it('should generate credentials with username and password', async () => {
      const result = await service.generateCredentials();

      expect(result).toHaveProperty('raw');
      expect(result).toHaveProperty('encrypted');
      expect(result.raw.username).toBe('admin');
      expect(result.raw.password).toBeDefined();
      expect(typeof result.raw.password).toBe('string');
    });

    it('should generate a 24-character password', async () => {
      const result = await service.generateCredentials();
      expect(result.raw.password).toHaveLength(24);
    });

    it('should generate different passwords each time', async () => {
      const result1 = await service.generateCredentials();
      const result2 = await service.generateCredentials();

      expect(result1.raw.password).not.toBe(result2.raw.password);
    });

    it('should return encrypted string for credentials', async () => {
      const result = await service.generateCredentials();

      expect(typeof result.encrypted).toBe('string');
      expect(result.encrypted.length).toBeGreaterThan(0);
    });
  });

  // ==================== Encrypt/Decrypt round-trip ====================

  describe('encrypt/decrypt round-trip', () => {
    it('should decrypt to original credentials', async () => {
      const generated = await service.generateCredentials();
      const decrypted = await service.decryptCredentials(generated.encrypted);

      expect(decrypted.username).toBe(generated.raw.username);
      expect(decrypted.password).toBe(generated.raw.password);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', async () => {
      const creds = { username: 'admin', password: 'test123' };
      const text = JSON.stringify(creds);

      // Access private encrypt method via any
      const encrypted1 = (service as any).encrypt(text);
      const encrypted2 = (service as any).encrypt(text);

      // Different IVs should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = (service as any).decrypt(encrypted1);
      const decrypted2 = (service as any).decrypt(encrypted2);

      expect(decrypted1).toBe(text);
      expect(decrypted2).toBe(text);
    });
  });

  // ==================== Decryption failures ====================

  describe('decryption failures', () => {
    it('should throw on tampered ciphertext', async () => {
      const generated = await service.generateCredentials();
      const tampered = generated.encrypted.slice(0, -4) + 'ZZZZ';

      await expect(service.decryptCredentials(tampered)).rejects.toThrow();
    });

    it('should throw on empty string', async () => {
      await expect(service.decryptCredentials('')).rejects.toThrow();
    });
  });

  // ==================== Development mode getDecrypted ====================

  describe('getDecrypted in development mode', () => {
    it('should return local credentials in development', async () => {
      const result = await service.getDecrypted('any-cluster-id');

      expect(result.username).toBe('admin');
      expect(result.password).toBe('admin');
      expect(result.connectionString).toBe('mongodb://localhost:27017');
    });
  });

  // ==================== Production mode getDecrypted ====================

  describe('getDecrypted in production mode', () => {
    it('should throw in production (not yet implemented)', async () => {
      const configService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'CREDENTIALS_ENCRYPTION_KEY') return 'a-long-enough-key-for-testing-purposes-32chars!';
          return undefined;
        }),
      } as any;

      const prodService = new CredentialsService(configService);
      await expect(prodService.getDecrypted('cluster-123')).rejects.toThrow(
        'Production credential retrieval not implemented',
      );
    });
  });

  // ==================== Custom encryption key ====================

  describe('with custom encryption key', () => {
    it('should use custom key from config when provided', async () => {
      const configService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'NODE_ENV') return 'development';
          if (key === 'CREDENTIALS_ENCRYPTION_KEY')
            return 'this-is-a-long-enough-key-for-aes256-encryption';
          if (key === 'MONGODB_URI') return 'mongodb://localhost:27017';
          return defaultValue;
        }),
      } as any;

      const customService = new CredentialsService(configService);
      const generated = await customService.generateCredentials();
      const decrypted = await customService.decryptCredentials(generated.encrypted);

      expect(decrypted.username).toBe('admin');
      expect(decrypted.password).toBe(generated.raw.password);
    });

    it('should fail to decrypt with wrong key', async () => {
      // Encrypt with one key
      const configService1 = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'CREDENTIALS_ENCRYPTION_KEY') return 'key-one-that-is-long-enough-32chars!!';
          return undefined;
        }),
      } as any;

      const service1 = new CredentialsService(configService1);
      const generated = await service1.generateCredentials();

      // Try to decrypt with different key
      const configService2 = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'CREDENTIALS_ENCRYPTION_KEY') return 'key-two-that-is-long-enough-32chars!!';
          return undefined;
        }),
      } as any;

      const service2 = new CredentialsService(configService2);
      await expect(service2.decryptCredentials(generated.encrypted)).rejects.toThrow();
    });
  });
});
