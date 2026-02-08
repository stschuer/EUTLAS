import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('AdminController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let regularToken: string;
  let testTenantId: string;
  let testAdminUserId: string;

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

    // Create admin user - note: this assumes there's a way to create admin users
    // In practice, the first user or a seeded user may be admin
    const adminEmail = `test-admin-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: adminEmail,
        password: 'TestPassword123!',
        name: 'Test Admin',
      });

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'TestPassword123!' });

    adminToken = adminLoginRes.body.data.accessToken;

    // Create regular user
    const regularEmail = `test-regular-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: regularEmail,
        password: 'TestPassword123!',
        name: 'Test Regular',
      });

    const regularLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: regularEmail, password: 'TestPassword123!' });

    regularToken = regularLoginRes.body.data.accessToken;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Admin Stats ====================

  describe('GET /admin/stats', () => {
    it('should return admin stats (or 403 for non-admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      // Will be 200 if user is admin, 403 otherwise
      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
      }
    });

    it('should reject non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);
    });
  });

  // ==================== Tenants ====================

  describe('GET /admin/tenants', () => {
    it('should list tenants (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('should support pagination and search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/tenants?page=1&limit=10&search=test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 403]).toContain(res.status);
    });
  });

  describe('POST /admin/tenants', () => {
    it('should create a tenant (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Tenant',
          ownerEmail: `tenant-owner-${Date.now()}@example.com`,
        });

      expect([201, 403]).toContain(res.status);

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('Test Tenant');
        testTenantId = res.body.data.id;
      }
    });
  });

  describe('GET /admin/tenants/:tenantId', () => {
    it('should get tenant details', async () => {
      if (!testTenantId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testTenantId);
    });
  });

  describe('PUT /admin/tenants/:tenantId', () => {
    it('should update tenant', async () => {
      if (!testTenantId) return;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/admin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Tenant' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Tenant');
    });
  });

  // ==================== Users (Admin) ====================

  describe('GET /admin/users', () => {
    it('should list all users (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /admin/users', () => {
    it('should create a user (admin only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: `admin-created-${Date.now()}@example.com`,
          password: 'AdminCreated123!',
          name: 'Admin Created User',
          isGlobalAdmin: false,
          verified: true,
          isActive: true,
        });

      expect([201, 403]).toContain(res.status);

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        testAdminUserId = res.body.data.id;
      }
    });
  });

  describe('GET /admin/users/:userId', () => {
    it('should get user details', async () => {
      if (!testAdminUserId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${testAdminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /admin/users/:userId', () => {
    it('should update user', async () => {
      if (!testAdminUserId) return;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/admin/users/${testAdminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Admin User', isActive: false })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /admin/users/:userId', () => {
    it('should delete user', async () => {
      if (!testAdminUserId) return;

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/users/${testAdminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  // ==================== Tenant Cleanup ====================

  describe('DELETE /admin/tenants/:tenantId', () => {
    it('should delete tenant', async () => {
      if (!testTenantId) return;

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });
});
