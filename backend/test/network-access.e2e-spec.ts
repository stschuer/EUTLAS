import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('NetworkAccessController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;
  let testEntryId: string;

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
    const uniqueEmail = `test-network-${Date.now()}@example.com`;
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
      .send({ name: 'Test Network Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Network Project' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-network-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /projects/:projectId/clusters/:clusterId/network/whitelist', () => {
    it('should add IP to whitelist', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cidrBlock: '192.168.1.0/24',
          comment: 'Test Office Network',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cidrBlock).toBe('192.168.1.0/24');
      expect(res.body.data.comment).toBe('Test Office Network');
      expect(res.body.data.isTemporary).toBe(false);
      testEntryId = res.body.data.id;
    });

    it('should add temporary IP with expiration', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cidrBlock: '10.0.0.1/32',
          comment: 'Temporary access',
          isTemporary: true,
          expiresAt: expiresAt.toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isTemporary).toBe(true);
      expect(res.body.data.expiresAt).toBeTruthy();
    });

    it('should reject duplicate CIDR', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cidrBlock: '192.168.1.0/24',
          comment: 'Duplicate',
        })
        .expect(409);
    });

    it('should reject invalid CIDR format', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cidrBlock: 'invalid-cidr',
          comment: 'Invalid',
        })
        .expect(400);
    });

    it('should reject temporary without expiration', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cidrBlock: '10.0.0.5/32',
          isTemporary: true,
        })
        .expect(400);
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/network/whitelist', () => {
    it('should list whitelist entries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /projects/:projectId/clusters/:clusterId/network/whitelist/add-current-ip', () => {
    it('should add current IP', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist/add-current-ip`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cidrBlock).toMatch(/\/32$/); // Should be /32 for single IP
    });
  });

  describe('POST /projects/:projectId/clusters/:clusterId/network/whitelist/allow-anywhere', () => {
    it('should allow from anywhere', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist/allow-anywhere`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cidrBlock).toBe('0.0.0.0/0');
    });
  });

  describe('DELETE /projects/:projectId/clusters/:clusterId/network/whitelist/:entryId', () => {
    it('should delete whitelist entry', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist/${testEntryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify entry is deleted
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist`)
        .set('Authorization', `Bearer ${authToken}`);

      const entry = listRes.body.data.find((e: any) => e.id === testEntryId);
      expect(entry).toBeUndefined();
    });

    it('should return 404 for non-existent entry', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/network/whitelist/000000000000000000000000`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});





