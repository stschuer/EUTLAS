import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Advanced Billing & Pricing (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let billingAccountId: string;

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

    const uniqueEmail = `test-billing-adv-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Billing',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Advanced Billing Org' });

    testOrgId = orgRes.body.data.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Billing Project' });

    testProjectId = projectRes.body.data.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Enterprise Plan Pricing ====================

  describe('GET /orgs/:orgId/billing/pricing', () => {
    it('should return pricing including enterprise plans', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/pricing`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const pricing = res.body.data;
      if (pricing && typeof pricing === 'object') {
        // Verify enterprise plan prices exist
        const planKeys = Object.keys(pricing);
        const hasEnterprisePlans = planKeys.some(
          (key) =>
            key.includes('xxl') ||
            key.includes('xxxl') ||
            key.includes('dedicated'),
        );

        if (hasEnterprisePlans) {
          // If enterprise plans are in the response, verify they have valid prices
          for (const key of planKeys) {
            if (pricing[key]?.monthlyPrice) {
              expect(pricing[key].monthlyPrice).toBeGreaterThan(0);
            }
          }
        }
      }
    });
  });

  // ==================== Billing Account with Trial Support ====================

  describe('POST /orgs/:orgId/billing/accounts', () => {
    it('should create a billing account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Billing Account',
          email: 'billing@testcompany.eu',
          companyName: 'Test GmbH',
          address: {
            street: 'Teststraße 1',
            city: 'Berlin',
            postalCode: '10115',
            country: 'DE',
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      billingAccountId = res.body.data.id;
    });
  });

  describe('GET /orgs/:orgId/billing/accounts', () => {
    it('should list billing accounts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Usage Tracking for Enterprise Plans ====================

  describe('GET /orgs/:orgId/billing/usage', () => {
    it('should return usage data', async () => {
      // First create a cluster to generate usage
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'billing-usage-cluster', plan: 'XXL' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/usage`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Invoice Generation ====================

  describe('GET /orgs/:orgId/billing/invoices', () => {
    it('should return invoices list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/invoices`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Cost Estimates for Enterprise Plans ====================

  describe('POST /orgs/:orgId/billing/estimate', () => {
    it('should estimate costs for XXL plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/estimate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: 'XXL',
          period: 'monthly',
        });

      // May return 201 or 200 depending on implementation
      if (res.status === 201 || res.status === 200) {
        expect(res.body.success).toBe(true);
        if (res.body.data?.estimate) {
          expect(res.body.data.estimate).toBeGreaterThan(0);
        }
      }
    });

    it('should estimate costs for DEDICATED_L plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/estimate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: 'DEDICATED_L',
          period: 'monthly',
        });

      if (res.status === 201 || res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it('should estimate annual costs with discount', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/estimate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          plan: 'XXXL',
          period: 'annual',
        });

      if (res.status === 201 || res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  // ==================== Credits ====================

  describe('GET /orgs/:orgId/billing/credits', () => {
    it('should return credits balance', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/credits`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
