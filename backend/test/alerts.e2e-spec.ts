import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AlertsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testRuleId: string;
  let testChannelId: string;

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
    const uniqueEmail = `test-alerts-${Date.now()}@example.com`;
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
      .send({ name: 'Test Alerts Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Alert Rules ====================

  describe('POST /orgs/:orgId/alerts/rules', () => {
    it('should create an alert rule', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/alerts/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'High CPU Alert',
          description: 'Fires when CPU exceeds 80%',
          metricType: 'cpu_usage',
          condition: 'gt',
          threshold: 80,
          severity: 'warning',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('High CPU Alert');
      expect(res.body.data.metricType).toBe('cpu_usage');
      expect(res.body.data.condition).toBe('gt');
      expect(res.body.data.threshold).toBe(80);
      expect(res.body.data.enabled).toBe(true);
      testRuleId = res.body.data.id;
    });

    it('should reject invalid metric type', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/alerts/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Alert',
          metricType: 'invalid_metric',
          condition: 'gt',
          threshold: 80,
        })
        .expect(400);
    });

    it('should reject invalid condition', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/alerts/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Condition Alert',
          metricType: 'cpu_usage',
          condition: 'invalid',
          threshold: 80,
        })
        .expect(400);
    });
  });

  describe('GET /orgs/:orgId/alerts/rules', () => {
    it('should list alert rules', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/alerts/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter by enabled', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/alerts/rules?enabled=true`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach((rule: any) => {
        expect(rule.enabled).toBe(true);
      });
    });
  });

  describe('PATCH /orgs/:orgId/alerts/rules/:ruleId', () => {
    it('should update alert rule', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/alerts/rules/${testRuleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated CPU Alert',
          threshold: 90,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated CPU Alert');
      expect(res.body.data.threshold).toBe(90);
    });

    it('should disable alert rule', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/alerts/rules/${testRuleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: false })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(false);
    });
  });

  // ==================== Notification Channels ====================

  describe('POST /orgs/:orgId/notification-channels', () => {
    it('should create email notification channel', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/notification-channels`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Email Channel',
          type: 'email',
          config: {
            emails: ['test@example.com'],
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Email Channel');
      expect(res.body.data.type).toBe('email');
      expect(res.body.data.enabled).toBe(true);
      testChannelId = res.body.data.id;
    });

    it('should create webhook notification channel', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/notification-channels`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Webhook',
          type: 'webhook',
          config: {
            webhookUrl: 'https://example.com/webhook',
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('webhook');
    });

    it('should reject email channel without emails', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/notification-channels`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Email Channel',
          type: 'email',
          config: {},
        })
        .expect(400);
    });
  });

  describe('GET /orgs/:orgId/notification-channels', () => {
    it('should list notification channels', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/notification-channels`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Alert History ====================

  describe('GET /orgs/:orgId/alerts/history/stats', () => {
    it('should return alert statistics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/alerts/history/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalFiring');
      expect(res.body.data).toHaveProperty('totalAcknowledged');
      expect(res.body.data).toHaveProperty('totalResolved24h');
      expect(res.body.data).toHaveProperty('bySeverity');
    });
  });

  describe('GET /orgs/:orgId/alerts/history', () => {
    it('should list alert history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/alerts/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Cleanup ====================

  describe('DELETE /orgs/:orgId/alerts/rules/:ruleId', () => {
    it('should delete alert rule', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}/alerts/rules/${testRuleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('DELETE /orgs/:orgId/notification-channels/:channelId', () => {
    it('should delete notification channel', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}/notification-channels/${testChannelId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});




