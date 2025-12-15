import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';

describe('BackupsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;
  let testBackupId: string;

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
    const uniqueEmail = `test-backup-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
      });

    authToken = loginRes.body.data.accessToken;

    // Create test organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Backup Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Backup Project' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-backup-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /projects/:projectId/clusters/:clusterId/backups', () => {
    it('should create a backup', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Backup',
          description: 'E2E test backup',
          retentionDays: 7,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Backup');
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.type).toBe('manual');
      testBackupId = res.body.data.id;
    });

    it('should reject backup creation without name', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Missing name',
        })
        .expect(400);
    });

    it('should reject backup creation without auth', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups`)
        .send({
          name: 'Unauthorized Backup',
        })
        .expect(401);
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/backups', () => {
    it('should list backups', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter backups by status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups?status=pending`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach((backup: any) => {
        expect(backup.status).toBe('pending');
      });
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/backups/stats', () => {
    it('should return backup statistics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalBackups');
      expect(res.body.data).toHaveProperty('completedBackups');
      expect(res.body.data).toHaveProperty('failedBackups');
      expect(res.body.data).toHaveProperty('totalSizeBytes');
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/backups/:backupId', () => {
    it('should get backup details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups/${testBackupId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testBackupId);
      expect(res.body.data.name).toBe('Test Backup');
    });

    it('should return 404 for non-existent backup', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/backups/000000000000000000000000`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});





