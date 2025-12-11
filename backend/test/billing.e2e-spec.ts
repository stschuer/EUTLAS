import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('BillingController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testInvoiceId: string;

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
    const uniqueEmail = `test-billing-${Date.now()}@example.com`;
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
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
      });

    authToken = loginRes.body.data.accessToken;

    // Create test organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Billing Org' });

    testOrgId = orgRes.body.data.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Billing Account ====================

  describe('POST /billing/account', () => {
    it('should create a billing account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/account`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billingEmail: 'billing-test@example.com',
          companyName: 'Test Company Ltd',
          vatId: 'DE999999999',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.billingEmail).toBe('billing-test@example.com');
      expect(res.body.data.companyName).toBe('Test Company Ltd');
      expect(res.body.data.currency).toBe('EUR');
      expect(res.body.data.taxPercent).toBe(19);
    });

    it('should reject duplicate billing account', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/account`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billingEmail: 'another@example.com',
        })
        .expect(400);
    });
  });

  describe('GET /billing/account', () => {
    it('should return billing account', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/account`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.billingEmail).toBe('billing-test@example.com');
    });
  });

  describe('PATCH /billing/account', () => {
    it('should update billing account', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/billing/account`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Updated Company Name',
          billingCycle: 'annual',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.companyName).toBe('Updated Company Name');
      expect(res.body.data.billingCycle).toBe('annual');
    });
  });

  // ==================== Prices ====================

  describe('GET /billing/prices', () => {
    it('should return price list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/prices`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      
      // Check plan prices exist
      const planDev = res.body.data.find((p: any) => p.priceCode === 'plan_dev');
      expect(planDev).toBeDefined();
      expect(planDev.unitAmountCents).toBe(900);
    });
  });

  // ==================== Invoices ====================

  describe('POST /billing/invoices/generate', () => {
    it('should generate an invoice', async () => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/invoices/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billingPeriodStart: periodStart.toISOString(),
          billingPeriodEnd: periodEnd.toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.currency).toBe('EUR');
      expect(res.body.data.billingDetails.email).toBe('billing-test@example.com');
      testInvoiceId = res.body.data.id;
    });

    it('should reject duplicate invoice for same period', async () => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/invoices/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billingPeriodStart: periodStart.toISOString(),
          billingPeriodEnd: periodEnd.toISOString(),
        })
        .expect(400);
    });
  });

  describe('GET /billing/invoices', () => {
    it('should list invoices', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/invoices`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /billing/invoices/stats', () => {
    it('should return invoice stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/invoices/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalPaid');
      expect(res.body.data).toHaveProperty('totalOpen');
      expect(res.body.data).toHaveProperty('totalOverdue');
      expect(res.body.data).toHaveProperty('invoiceCount');
    });
  });

  describe('POST /billing/invoices/:id/finalize', () => {
    it('should finalize a draft invoice', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/invoices/${testInvoiceId}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('open');
    });
  });

  describe('POST /billing/invoices/:id/paid', () => {
    it('should mark invoice as paid', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/invoices/${testInvoiceId}/paid`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentReference: 'TEST-PAY-001',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.paidAt).toBeDefined();
    });
  });

  // ==================== Usage ====================

  describe('GET /billing/usage/summary', () => {
    it('should return usage summary', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/billing/usage/summary`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalCents');
      expect(res.body.data).toHaveProperty('totalFormatted');
      expect(res.body.data).toHaveProperty('byCluster');
      expect(res.body.data).toHaveProperty('byUsageType');
    });
  });

  // ==================== Credits ====================

  describe('POST /billing/account/credit', () => {
    it('should add credit to account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/billing/account/credit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amountCents: 5000,
          description: 'Test credit',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.creditBalanceCents).toBe(5000);
    });
  });
});



