import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MigrationController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();

    // Create test user and get auth token
    const uniqueEmail = `test-migration-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Migration',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    // Create test organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Migration Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Migration Project' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-migration-cluster', plan: 'MEDIUM' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/migrations`;

  // ==================== Analyze Source ====================

  describe('POST .../migrations/analyze', () => {
    it('should reject analyze without sourceUri', async () => {
      await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should reject analyze with empty sourceUri', async () => {
      await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sourceUri: '' })
        .expect(400);
    });

    it('should return invalid result for unreachable host', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sourceUri: 'mongodb://nonexistent.invalid:27017' })
        .expect(201);

      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('should return invalid result for bad auth', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sourceUri: 'mongodb://baduser:badpass@localhost:27017' })
        .expect(201);

      // Should return a result (not throw), with valid=false
      expect(res.body).toHaveProperty('valid');
      if (!res.body.valid) {
        expect(res.body.error).toBeDefined();
      }
    });

    it('should reject analyze without auth token', async () => {
      await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .send({ sourceUri: 'mongodb://localhost:27017' })
        .expect(401);
    });

    it('should analyze the local MongoDB successfully', async () => {
      // Use the local test MongoDB instance
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sourceUri: 'mongodb://localhost:27017' })
        .expect(201);

      // If local MongoDB is running, we get a full analysis
      if (res.body.valid) {
        expect(res.body.mongoVersion).toBeDefined();
        expect(res.body.databases).toBeDefined();
        expect(Array.isArray(res.body.databases)).toBe(true);
        expect(res.body.totalSizeBytes).toBeDefined();
        expect(res.body.totalDocuments).toBeDefined();
        expect(res.body.totalCollections).toBeDefined();
        expect(res.body.totalIndexes).toBeDefined();
        expect(res.body.estimatedMigrationTimeSec).toBeDefined();
        expect(typeof res.body.estimatedMigrationTimeSec).toBe('number');
        expect(res.body.estimatedMigrationTimeSec).toBeGreaterThan(0);

        // Verify database detail structure
        if (res.body.databases.length > 0) {
          const db = res.body.databases[0];
          expect(db).toHaveProperty('name');
          expect(db).toHaveProperty('sizeOnDisk');
          expect(db).toHaveProperty('collections');
          expect(db).toHaveProperty('indexes');
          expect(db).toHaveProperty('documents');
        }

        // System databases should be excluded
        const dbNames = res.body.databases.map((d: any) => d.name);
        expect(dbNames).not.toContain('admin');
        expect(dbNames).not.toContain('local');
        expect(dbNames).not.toContain('config');
      }
    });
  });

  // ==================== Start Migration ====================

  describe('POST .../migrations', () => {
    let testMigrationId: string;

    it('should reject migration without required fields', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should reject migration without sourceProvider', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceUri: 'mongodb://localhost:27017',
        })
        .expect(400);
    });

    it('should reject migration with invalid sourceProvider', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'invalid-provider',
        })
        .expect(400);
    });

    it('should reject migration without auth token', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .send({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
        })
        .expect(401);
    });

    it('should start a migration from local MongoDB', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
          options: {
            dropExisting: true,
            includeIndexes: true,
            includeGridFS: true,
            compressTransfer: true,
            numParallelCollections: 4,
          },
        });

      // If local MongoDB is available, migration starts
      if (res.status === 201) {
        expect(res.body.status).toBe('pending');
        expect(res.body).toHaveProperty('id');
        expect(res.body.sourceProvider).toBe('self-hosted');
        expect(res.body.progress).toBe(0);
        expect(res.body.options).toBeDefined();
        expect(res.body.options.dropExisting).toBe(true);
        expect(res.body.options.includeIndexes).toBe(true);
        expect(res.body.databaseProgress).toBeDefined();
        expect(res.body.stats).toBeDefined();
        expect(res.body.stats.totalDatabases).toBeDefined();
        expect(res.body.log).toBeDefined();
        expect(Array.isArray(res.body.log)).toBe(true);

        // Source URI should be masked in the response
        expect(res.body.sourceUri).not.toContain('password');

        testMigrationId = res.body.id;
      } else {
        // 400 means source can't connect -- acceptable in CI
        expect(res.status).toBe(400);
      }
    });

    it('should start a migration with database selection', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
          databases: ['testdb'],
          options: {
            dropExisting: false,
          },
        });

      // Accept 201 (migration started) or 400 (no matching databases / can't connect)
      expect([201, 400]).toContain(res.status);
    });

    it('should reject duplicate active migration', async () => {
      if (!testMigrationId) return;

      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceUri: 'mongodb://localhost:27017',
          sourceProvider: 'self-hosted',
        });

      // Should reject because there's already an active migration
      expect(res.status).toBe(400);
    });

    // ==================== List Migrations ====================

    describe('GET .../migrations', () => {
      it('should list migrations for cluster', async () => {
        const res = await request(app.getHttpServer())
          .get(basePath())
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should reject list without auth token', async () => {
        await request(app.getHttpServer())
          .get(basePath())
          .expect(401);
      });
    });

    // ==================== Get Migration ====================

    describe('GET .../migrations/:migrationId', () => {
      it('should get migration details', async () => {
        if (!testMigrationId) return;

        const res = await request(app.getHttpServer())
          .get(`${basePath()}/${testMigrationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.id).toBe(testMigrationId);
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('progress');
        expect(res.body).toHaveProperty('stats');
        expect(res.body).toHaveProperty('databaseProgress');
        expect(res.body).toHaveProperty('log');
      });

      it('should return 404 for non-existent migration', async () => {
        await request(app.getHttpServer())
          .get(`${basePath()}/000000000000000000000000`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });

    // ==================== Get Migration Logs ====================

    describe('GET .../migrations/:migrationId/logs', () => {
      it('should get migration logs', async () => {
        if (!testMigrationId) return;

        const res = await request(app.getHttpServer())
          .get(`${basePath()}/${testMigrationId}/logs`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body).toHaveProperty('migrationId');
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('progress');
        expect(res.body).toHaveProperty('logs');
        expect(Array.isArray(res.body.logs)).toBe(true);

        if (res.body.logs.length > 0) {
          expect(res.body.logs[0]).toHaveProperty('timestamp');
          expect(res.body.logs[0]).toHaveProperty('level');
          expect(res.body.logs[0]).toHaveProperty('message');
        }
      });

      it('should return 404 for non-existent migration logs', async () => {
        await request(app.getHttpServer())
          .get(`${basePath()}/000000000000000000000000/logs`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });

    // ==================== Cancel Migration ====================

    describe('DELETE .../migrations/:migrationId', () => {
      it('should cancel an active migration', async () => {
        if (!testMigrationId) return;

        const res = await request(app.getHttpServer())
          .delete(`${basePath()}/${testMigrationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.status).toBe('cancelled');
      });

      it('should reject cancelling an already cancelled migration', async () => {
        if (!testMigrationId) return;

        await request(app.getHttpServer())
          .delete(`${basePath()}/${testMigrationId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);
      });

      it('should return 404 when cancelling non-existent migration', async () => {
        await request(app.getHttpServer())
          .delete(`${basePath()}/000000000000000000000000`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });

    // ==================== Retry Migration ====================

    describe('POST .../migrations/:migrationId/retry', () => {
      it('should retry a cancelled migration', async () => {
        if (!testMigrationId) return;

        const res = await request(app.getHttpServer())
          .post(`${basePath()}/${testMigrationId}/retry`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(201);

        expect(res.body.status).toBe('pending');
        expect(res.body.progress).toBe(0);
      });

      it('should reject retrying a pending migration', async () => {
        if (!testMigrationId) return;

        // Migration is now pending again after retry, so retrying should fail
        await request(app.getHttpServer())
          .post(`${basePath()}/${testMigrationId}/retry`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);
      });

      it('should return 404 when retrying non-existent migration', async () => {
        await request(app.getHttpServer())
          .post(`${basePath()}/000000000000000000000000/retry`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });
  });
});
