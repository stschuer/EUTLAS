import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Enterprise Plans (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;

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

    const uniqueEmail = `test-enterprise-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Enterprise',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Enterprise Org' });

    testOrgId = orgRes.body.data.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Enterprise Project' });

    testProjectId = projectRes.body.data.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Create Clusters with New Enterprise Plans ====================

  describe('POST /projects/:projectId/clusters (Enterprise Plans)', () => {
    it('should create a cluster with XXL plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-xxl-cluster',
          plan: 'XXL',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.plan).toBe('XXL');
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('status');
    });

    it('should create a cluster with XXXL plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-xxxl-cluster',
          plan: 'XXXL',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.plan).toBe('XXXL');
    });

    it('should create a cluster with DEDICATED_L plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-dedicated-l-cluster',
          plan: 'DEDICATED_L',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.plan).toBe('DEDICATED_L');
    });

    it('should create a cluster with DEDICATED_XL plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-dedicated-xl-cluster',
          plan: 'DEDICATED_XL',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.plan).toBe('DEDICATED_XL');
    });
  });

  // ==================== Resize to Enterprise Plans ====================

  describe('POST /projects/:projectId/clusters/:clusterId/resize (Enterprise Plans)', () => {
    let smallClusterId: string;

    beforeAll(async () => {
      const clusterRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'resize-test-cluster', plan: 'SMALL' });

      smallClusterId = clusterRes.body.data.id;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should resize from SMALL to XXL', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${smallClusterId}/resize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: 'XXL' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should resize to DEDICATED_L', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${smallClusterId}/resize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ plan: 'DEDICATED_L' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Scaling with Enterprise Plans ====================

  describe('Scaling Recommendations with Enterprise Plans', () => {
    let xlClusterId: string;

    beforeAll(async () => {
      const clusterRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'scale-enterprise-cluster', plan: 'XLARGE' });

      xlClusterId = clusterRes.body.data.id;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should return scaling recommendations including enterprise tiers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${xlClusterId}/scaling/recommendations`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should enable auto-scaling with enterprise plan boundaries', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${xlClusterId}/scaling/auto-scaling/enable`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          minPlan: 'LARGE',
          maxPlan: 'DEDICATED_L',
          scaleUpThreshold: 80,
          scaleDownThreshold: 20,
          cooldownMinutes: 30,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== List All Clusters ====================

  describe('GET /projects/:projectId/clusters (verify enterprise plans)', () => {
    it('should list all clusters including enterprise plan clusters', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const plans = res.body.data.map((c: any) => c.plan);
      expect(plans).toContain('XXL');
      expect(plans).toContain('XXXL');
      expect(plans).toContain('DEDICATED_L');
      expect(plans).toContain('DEDICATED_XL');
    });
  });
});
