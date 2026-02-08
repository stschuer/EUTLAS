import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuditController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;

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

    const uniqueEmail = `test-audit-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Audit',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Audit Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Query Audit Logs ====================

  describe('GET /orgs/:orgId/audit', () => {
    it('should return audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit?page=1&limit=5`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should support date filtering', async () => {
      const startDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      const endDate = new Date().toISOString();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Audit Stats ====================

  describe('GET /orgs/:orgId/audit/stats', () => {
    it('should return audit statistics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should support days parameter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit/stats?days=7`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Available Actions & Resource Types ====================

  describe('GET /orgs/:orgId/audit/actions', () => {
    it('should return available audit actions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit/actions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /orgs/:orgId/audit/resource-types', () => {
    it('should return available resource types', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit/resource-types`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Export Audit Logs ====================

  describe('GET /orgs/:orgId/audit/export', () => {
    it('should export audit logs as JSON', async () => {
      const startDate = new Date(Date.now() - 86400000).toISOString();
      const endDate = new Date().toISOString();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit/export?startDate=${startDate}&endDate=${endDate}&format=json`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Export returns file data
      expect(res.body).toBeDefined();
    });

    it('should export audit logs as CSV', async () => {
      const startDate = new Date(Date.now() - 86400000).toISOString();
      const endDate = new Date().toISOString();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/audit/export?startDate=${startDate}&endDate=${endDate}&format=csv`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });
});
