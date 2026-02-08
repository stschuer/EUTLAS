import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ClustersController (e2e)', () => {
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
    const uniqueEmail = `test-clusters-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Clusters',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    // Create test organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Clusters Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Clusters Project' });

    testProjectId = projectRes.body.data.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Create Cluster ====================

  describe('POST /projects/:projectId/clusters', () => {
    it('should create a cluster', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-e2e-cluster',
          plan: 'DEV',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('test-e2e-cluster');
      expect(res.body.data.plan).toBe('DEV');
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('status');
      testClusterId = res.body.data.id;
    });

    it('should create a cluster with version and region', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-e2e-cluster-full',
          plan: 'SMALL',
          mongoVersion: '7.0',
          region: 'fsn1',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('test-e2e-cluster-full');
    });

    it('should reject cluster without name', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: 'DEV' })
        .expect(400);
    });

    it('should reject invalid plan', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'invalid-plan', plan: 'INVALID' })
        .expect(400);
    });
  });

  // ==================== List Clusters ====================

  describe('GET /projects/:projectId/clusters', () => {
    it('should list clusters in project', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Cluster ====================

  describe('GET /projects/:projectId/clusters/:clusterId', () => {
    it('should get cluster by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testClusterId);
      expect(res.body.data.name).toBe('test-e2e-cluster');
    });

    it('should return 404 for non-existent cluster', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/000000000000000000000000`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ==================== Get Cluster Credentials ====================

  describe('GET /projects/:projectId/clusters/:clusterId/credentials', () => {
    it('should get cluster credentials', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/credentials`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('connectionString');
    });
  });

  // ==================== Update Cluster ====================

  describe('PATCH /projects/:projectId/clusters/:clusterId', () => {
    it('should rename cluster', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'renamed-e2e-cluster' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('renamed-e2e-cluster');
    });
  });

  // ==================== Cluster Lifecycle ====================

  describe('POST /projects/:projectId/clusters/:clusterId/resize', () => {
    it('should resize cluster', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/resize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: 'SMALL' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /projects/:projectId/clusters/:clusterId/pause', () => {
    it('should pause cluster', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/pause`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'E2E test pause' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /projects/:projectId/clusters/:clusterId/resume', () => {
    it('should resume cluster', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'E2E test resume' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /projects/:projectId/clusters/:clusterId/clone', () => {
    it('should clone cluster', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/clone`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'cloned-e2e-cluster' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('cloned-e2e-cluster');
    });
  });

  // ==================== Delete Cluster ====================

  describe('DELETE /projects/:projectId/clusters/:clusterId', () => {
    it('should delete a cluster', async () => {
      // Create a cluster to delete
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'cluster-to-delete', plan: 'DEV' });

      const clusterToDelete = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${clusterToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify cluster is deleted
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${clusterToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
