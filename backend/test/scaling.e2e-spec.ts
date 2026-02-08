import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('ScalingController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

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

    const uniqueEmail = `test-scaling-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Scaling',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Scaling Org' });

    testOrgId = orgRes.body.data.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Scaling Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-scaling-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/scaling`;

  // ==================== Scaling Recommendations ====================

  describe('GET .../scaling/recommendations', () => {
    it('should return scaling recommendations', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/recommendations`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET .../scaling/recommendations/history', () => {
    it('should return recommendation history', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/recommendations/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Scaling Analysis ====================

  describe('POST .../scaling/analyze', () => {
    it('should trigger scaling analysis', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Auto-Scaling Config ====================

  describe('GET .../scaling/auto-scaling/config', () => {
    it('should return auto-scaling config', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/auto-scaling/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST .../scaling/auto-scaling/enable', () => {
    it('should enable auto-scaling', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/auto-scaling/enable`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          minPlan: 'DEV',
          maxPlan: 'MEDIUM',
          scaleUpThreshold: 80,
          scaleDownThreshold: 20,
          cooldownMinutes: 30,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET .../scaling/auto-scaling/history', () => {
    it('should return auto-scaling history', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/auto-scaling/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST .../scaling/auto-scaling/disable', () => {
    it('should disable auto-scaling', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/auto-scaling/disable`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Org Scaling Stats ====================

  describe('GET /orgs/:orgId/scaling/stats', () => {
    it('should return org scaling stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/scaling/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });
});
