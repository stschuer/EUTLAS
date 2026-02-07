import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ValidateSourceDto,
  StartMigrationDto,
  MigrationOptionsDto,
} from './migration.dto';

describe('Migration DTOs', () => {
  describe('ValidateSourceDto', () => {
    it('should pass with valid sourceUri', async () => {
      const dto = plainToInstance(ValidateSourceDto, {
        sourceUri: 'mongodb://user:pass@host:27017',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty sourceUri', async () => {
      const dto = plainToInstance(ValidateSourceDto, { sourceUri: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without sourceUri', async () => {
      const dto = plainToInstance(ValidateSourceDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('StartMigrationDto', () => {
    it('should pass with valid required fields', async () => {
      const dto = plainToInstance(StartMigrationDto, {
        sourceUri: 'mongodb://host:27017',
        sourceProvider: 'atlas',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with all optional fields', async () => {
      const dto = plainToInstance(StartMigrationDto, {
        sourceUri: 'mongodb://host:27017',
        sourceProvider: 'self-hosted',
        databases: ['db1', 'db2'],
        excludeDatabases: ['test'],
        collections: ['db1.users'],
        options: {
          dropExisting: true,
          preserveUUIDs: false,
          numParallelCollections: 8,
          oplogReplay: false,
          includeIndexes: true,
          includeGridFS: true,
          compressTransfer: true,
        },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without sourceUri', async () => {
      const dto = plainToInstance(StartMigrationDto, {
        sourceProvider: 'atlas',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without sourceProvider', async () => {
      const dto = plainToInstance(StartMigrationDto, {
        sourceUri: 'mongodb://host:27017',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid sourceProvider', async () => {
      const dto = plainToInstance(StartMigrationDto, {
        sourceUri: 'mongodb://host:27017',
        sourceProvider: 'invalid-provider',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept all valid sourceProvider values', async () => {
      const providers = [
        'atlas',
        'self-hosted',
        'digitalocean',
        'aws-documentdb',
        'other',
      ];

      for (const provider of providers) {
        const dto = plainToInstance(StartMigrationDto, {
          sourceUri: 'mongodb://host:27017',
          sourceProvider: provider,
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });
  });

  describe('MigrationOptionsDto', () => {
    it('should pass with valid options', async () => {
      const dto = plainToInstance(MigrationOptionsDto, {
        dropExisting: true,
        preserveUUIDs: false,
        numParallelCollections: 4,
        oplogReplay: false,
        includeIndexes: true,
        includeGridFS: true,
        compressTransfer: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with empty object (all optional)', async () => {
      const dto = plainToInstance(MigrationOptionsDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject numParallelCollections < 1', async () => {
      const dto = plainToInstance(MigrationOptionsDto, {
        numParallelCollections: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject numParallelCollections > 16', async () => {
      const dto = plainToInstance(MigrationOptionsDto, {
        numParallelCollections: 32,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept boundary values for numParallelCollections', async () => {
      for (const num of [1, 8, 16]) {
        const dto = plainToInstance(MigrationOptionsDto, {
          numParallelCollections: num,
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });
  });
});
