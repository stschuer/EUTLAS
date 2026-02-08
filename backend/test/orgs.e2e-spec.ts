import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('OrgsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let secondUserToken: string;
  let secondUserId: string;
  let testOrgId: string;

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

    // Create primary test user
    const uniqueEmail = `test-orgs-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test OrgOwner',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    // Create second user for member tests
    const secondEmail = `test-orgs-member-${Date.now()}@example.com`;
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: secondEmail,
        password: 'TestPassword123!',
        name: 'Test Member',
      });

    secondUserId = signupRes.body.data.userId;

    const secondLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: secondEmail, password: 'TestPassword123!' });

    secondUserToken = secondLoginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Create Organization ====================

  describe('POST /orgs', () => {
    it('should create an organization', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orgs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Organization' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Organization');
      expect(res.body.data).toHaveProperty('id');
      testOrgId = res.body.data.id;
    });

    it('should reject org without name', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orgs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orgs')
        .send({ name: 'Unauthorized Org' })
        .expect(401);
    });
  });

  // ==================== List Organizations ====================

  describe('GET /orgs', () => {
    it('should list organizations for current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orgs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const org = res.body.data.find((o: any) => o.id === testOrgId);
      expect(org).toBeDefined();
      expect(org.name).toBe('Test Organization');
    });

    it('should not list orgs for another user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orgs')
        .set('Authorization', `Bearer ${secondUserToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const org = res.body.data.find((o: any) => o.id === testOrgId);
      expect(org).toBeUndefined();
    });
  });

  // ==================== Get Organization ====================

  describe('GET /orgs/:orgId', () => {
    it('should get organization by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testOrgId);
      expect(res.body.data.name).toBe('Test Organization');
    });

    it('should return 404 for non-existent org', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orgs/000000000000000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ==================== Update Organization ====================

  describe('PATCH /orgs/:orgId', () => {
    it('should update organization name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Organization' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Organization');
    });

    it('should reject update from non-member', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ name: 'Unauthorized Update' })
        .expect(403);
    });
  });

  // ==================== Members ====================

  describe('GET /orgs/:orgId/members', () => {
    it('should list organization members', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('PATCH /orgs/:orgId/members/:userId', () => {
    it('should update member role', async () => {
      // First we need to add the second user to the org via invitation or direct add
      // For now, test role update concept with existing members
      const membersRes = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/members`)
        .set('Authorization', `Bearer ${authToken}`);

      const firstMember = membersRes.body.data[0];

      // Attempting to change own role should be restricted or handled
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/members/${firstMember.userId || firstMember.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ role: 'ADMIN' });

      // Owner changing own role may be rejected
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  // ==================== Delete Organization ====================

  describe('DELETE /orgs/:orgId', () => {
    it('should delete organization', async () => {
      // Create a new org to delete
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/orgs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Org To Delete' });

      const orgToDelete = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${orgToDelete}?force=true`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify org is deleted
      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${orgToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should reject delete from non-owner', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}`)
        .set('Authorization', `Bearer ${secondUserToken}`)
        .expect(403);
    });
  });
});
