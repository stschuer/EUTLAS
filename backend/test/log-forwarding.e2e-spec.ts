import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('LogForwardingController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;
  let testConfigId: string;

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

    const uniqueEmail = `test-logfwd-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'LogFwd',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test LogFwd Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test LogFwd Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-logfwd-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/log-forwarding`;

  // ==================== Supported Destinations ====================

  describe('GET .../log-forwarding/destinations', () => {
    it('should return supported destinations', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/destinations`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Create Log Forwarding ====================

  describe('POST .../log-forwarding', () => {
    it('should create a webhook log forwarding config', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Webhook Forward',
          destinationType: 'webhook',
          enabled: true,
          logTypes: ['audit', 'mongodb'],
          webhookConfig: {
            url: 'https://example.com/logs',
            headers: { 'X-Api-Key': 'test-key' },
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Webhook Forward');
      expect(res.body.data.destinationType).toBe('webhook');
      expect(res.body.data).toHaveProperty('id');
      testConfigId = res.body.data.id;
    });

    it('should create an S3 log forwarding config', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test S3 Forward',
          destinationType: 's3',
          enabled: false,
          s3Config: {
            bucketName: 'test-logs-bucket',
            region: 'eu-central-1',
            accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
            secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            prefix: 'mongodb-logs/',
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should reject config without destination type', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Invalid Config' })
        .expect(400);
    });
  });

  // ==================== List Configs ====================

  describe('GET .../log-forwarding', () => {
    it('should list log forwarding configs', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Config ====================

  describe('GET .../log-forwarding/:configId', () => {
    it('should get config details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testConfigId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testConfigId);
    });
  });

  // ==================== Update Config ====================

  describe('PATCH .../log-forwarding/:configId', () => {
    it('should update config', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/${testConfigId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Webhook Forward' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Webhook Forward');
    });
  });

  // ==================== Toggle Config ====================

  describe('POST .../log-forwarding/:configId/toggle', () => {
    it('should toggle config off', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testConfigId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: false })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should toggle config on', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testConfigId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: true })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Stats ====================

  describe('GET .../log-forwarding/:configId/stats', () => {
    it('should get forwarding stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testConfigId}/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Delete Config ====================

  describe('DELETE .../log-forwarding/:configId', () => {
    it('should delete config', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/${testConfigId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
