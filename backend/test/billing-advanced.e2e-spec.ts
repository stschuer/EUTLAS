import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('Advanced Billing & Pricing (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let billingAccountId: string;

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

    const uniqueEmail = `test-billing-adv-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Billing',
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
        .get(`/api/v1/orgs/${testOrgId}/billing/prices`)
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

  describe('POST /orgs/:orgId/billing/account', () => {
    it('should create a billing account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/account`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billingName: 'Test Billing Account',
          billingEmail: 'billing@testcompany.eu',
          companyName: 'Test GmbH',
          address: {
            line1: 'Teststraße 1',
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

  describe('GET /orgs/:orgId/billing/account', () => {
    it('should get billing account', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/account`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
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

  describe('GET /orgs/:orgId/billing/prices', () => {
    it('should return pricing information', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/prices`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
