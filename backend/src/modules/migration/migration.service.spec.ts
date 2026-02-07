import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MigrationService } from './migration.service';
import { Migration } from './schemas/migration.schema';
import { EventsService } from '../events/events.service';
import { ClustersService } from '../clusters/clusters.service';
import { JobsService } from '../jobs/jobs.service';

describe('MigrationService', () => {
  let service: MigrationService;
  let migrationModel: any;
  let clustersService: any;
  let jobsService: any;
  let eventsService: any;

  // Use valid ObjectId strings for tests
  const CLUSTER_ID = new Types.ObjectId().toString();
  const PROJECT_ID = new Types.ObjectId().toString();
  const ORG_ID = new Types.ObjectId().toString();
  const USER_ID = new Types.ObjectId().toString();
  const MIGRATION_ID = new Types.ObjectId().toString();
  const JOB_ID = new Types.ObjectId().toString();

  const mockMigrationModel = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  };

  const mockClustersService = {
    findById: jest.fn(),
    findByIdWithCredentials: jest.fn(),
  };

  const mockJobsService = {
    createJob: jest.fn(),
    cancelJob: jest.fn(),
  };

  const mockEventsService = {
    createEvent: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('development'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationService,
        { provide: getModelToken(Migration.name), useValue: mockMigrationModel },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: ClustersService, useValue: mockClustersService },
        { provide: JobsService, useValue: mockJobsService },
      ],
    }).compile();

    service = module.get<MigrationService>(MigrationService);
    migrationModel = module.get(getModelToken(Migration.name));
    clustersService = module.get(ClustersService);
    jobsService = module.get(JobsService);
    eventsService = module.get(EventsService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('analyzeSource', () => {
    it('should return invalid for unreachable hosts', async () => {
      const result = await service.analyzeSource(
        'mongodb://nonexistent.invalid:27017',
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000);

    it('should return invalid for bad URI format', async () => {
      const result = await service.analyzeSource('not-a-valid-uri');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    }, 15000);
  });

  describe('startMigration', () => {
    it('should throw NotFoundException if target cluster does not exist', async () => {
      mockClustersService.findById.mockResolvedValue(null);

      await expect(
        service.startMigration({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
          targetClusterId: CLUSTER_ID,
          projectId: PROJECT_ID,
          orgId: ORG_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if cluster is not ready', async () => {
      mockClustersService.findById.mockResolvedValue({
        _id: CLUSTER_ID,
        status: 'creating',
      });

      await expect(
        service.startMigration({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
          targetClusterId: CLUSTER_ID,
          projectId: PROJECT_ID,
          orgId: ORG_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if active migration exists', async () => {
      mockClustersService.findById.mockResolvedValue({
        _id: CLUSTER_ID,
        status: 'ready',
      });

      mockMigrationModel.findOne.mockResolvedValue({
        id: MIGRATION_ID,
        status: 'dumping',
      });

      await expect(
        service.startMigration({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
          targetClusterId: CLUSTER_ID,
          projectId: PROJECT_ID,
          orgId: ORG_ID,
          userId: USER_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMigration', () => {
    it('should return migration by ID', async () => {
      const mockMigration = {
        id: MIGRATION_ID,
        status: 'completed',
        progress: 100,
      };
      mockMigrationModel.findById.mockResolvedValue(mockMigration);

      const result = await service.getMigration(MIGRATION_ID);
      expect(result).toEqual(mockMigration);
      expect(mockMigrationModel.findById).toHaveBeenCalledWith(MIGRATION_ID);
    });

    it('should return null for non-existent migration', async () => {
      mockMigrationModel.findById.mockResolvedValue(null);

      const result = await service.getMigration(MIGRATION_ID);
      expect(result).toBeNull();
    });
  });

  describe('listMigrations', () => {
    it('should list migrations for a cluster', async () => {
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { id: 'mig1', status: 'completed' },
          { id: 'mig2', status: 'failed' },
        ]),
      };
      mockMigrationModel.find.mockReturnValue(mockChain);

      const result = await service.listMigrations(CLUSTER_ID);
      expect(result).toHaveLength(2);
      expect(mockMigrationModel.find).toHaveBeenCalled();
    });

    it('should list all migrations when no cluster specified', async () => {
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };
      mockMigrationModel.find.mockReturnValue(mockChain);

      const result = await service.listMigrations();
      expect(mockMigrationModel.find).toHaveBeenCalled();
    });
  });

  describe('cancelMigration', () => {
    it('should throw NotFoundException if migration does not exist', async () => {
      mockMigrationModel.findById.mockResolvedValue(null);

      await expect(
        service.cancelMigration(MIGRATION_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if migration is already completed', async () => {
      mockMigrationModel.findById.mockResolvedValue({
        id: MIGRATION_ID,
        status: 'completed',
        targetOrgId: { toString: () => ORG_ID },
        targetProjectId: { toString: () => PROJECT_ID },
        targetClusterId: { toString: () => CLUSTER_ID },
      });

      await expect(
        service.cancelMigration(MIGRATION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if migration is already failed', async () => {
      mockMigrationModel.findById.mockResolvedValue({
        id: MIGRATION_ID,
        status: 'failed',
        targetOrgId: { toString: () => ORG_ID },
        targetProjectId: { toString: () => PROJECT_ID },
        targetClusterId: { toString: () => CLUSTER_ID },
      });

      await expect(
        service.cancelMigration(MIGRATION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cancel an active migration', async () => {
      const mockMigration = {
        id: MIGRATION_ID,
        status: 'dumping',
        jobId: { toString: () => JOB_ID },
        targetOrgId: { toString: () => ORG_ID },
        targetProjectId: { toString: () => PROJECT_ID },
        targetClusterId: { toString: () => CLUSTER_ID },
      };
      mockMigrationModel.findById.mockResolvedValue(mockMigration);
      mockMigrationModel.findByIdAndUpdate.mockResolvedValue({
        ...mockMigration,
        status: 'cancelled',
      });
      mockJobsService.cancelJob.mockResolvedValue(undefined);
      mockEventsService.createEvent.mockResolvedValue(undefined);

      const result = await service.cancelMigration(MIGRATION_ID);
      expect(result.status).toBe('cancelled');
      expect(mockJobsService.cancelJob).toHaveBeenCalledWith(JOB_ID);
    });
  });

  describe('retryMigration', () => {
    it('should throw NotFoundException if migration does not exist', async () => {
      mockMigrationModel.findById.mockResolvedValue(null);

      await expect(
        service.retryMigration(MIGRATION_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if migration is not failed or cancelled', async () => {
      mockMigrationModel.findById.mockResolvedValue({
        id: MIGRATION_ID,
        status: 'dumping',
      });

      await expect(
        service.retryMigration(MIGRATION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should retry a failed migration', async () => {
      const mockMigration = {
        id: MIGRATION_ID,
        status: 'failed',
        sourceUri: 'mongodb://localhost:27017',
        databases: ['testdb'],
        options: { dropExisting: true },
        targetClusterId: { toString: () => CLUSTER_ID },
        targetProjectId: { toString: () => PROJECT_ID },
        targetOrgId: { toString: () => ORG_ID },
      };
      mockMigrationModel.findById.mockResolvedValue(mockMigration);
      mockMigrationModel.findByIdAndUpdate.mockResolvedValue({
        ...mockMigration,
        status: 'pending',
        progress: 0,
      });
      mockJobsService.createJob.mockResolvedValue({ _id: JOB_ID });

      const result = await service.retryMigration(MIGRATION_ID);
      expect(result.status).toBe('pending');
      expect(mockJobsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MIGRATE_CLUSTER',
          payload: expect.objectContaining({
            migrationId: MIGRATION_ID,
          }),
        }),
      );
    });
  });
});
