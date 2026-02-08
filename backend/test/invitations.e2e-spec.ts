import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('InvitationsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testInvitationId: string;

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
    const uniqueEmail = `test-invite-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test User',
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
      .send({ name: 'Test Invitations Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orgs/:orgId/invitations', () => {
    it('should create an invitation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/invitations`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invited@example.com',
          role: 'MEMBER',
          message: 'Welcome!',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('invited@example.com');
      expect(res.body.data.role).toBe('MEMBER');
      expect(res.body.data.status).toBe('pending');
      testInvitationId = res.body.data.id;
    });

    it('should reject duplicate invitation', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/invitations`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invited@example.com',
          role: 'MEMBER',
        })
        .expect(409);
    });

    it('should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/invitations`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'not-an-email',
          role: 'MEMBER',
        })
        .expect(400);
    });

    it('should reject invalid role', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/invitations`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'another@example.com',
          role: 'OWNER', // OWNER cannot be invited
        })
        .expect(400);
    });
  });

  describe('GET /orgs/:orgId/invitations/pending', () => {
    it('should list pending invitations', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/invitations/pending`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /orgs/:orgId/invitations/:invitationId/resend', () => {
    it('should resend invitation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/invitations/${testInvitationId}/resend`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'Updated message' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /orgs/:orgId/invitations/:invitationId', () => {
    it('should revoke invitation', async () => {
      // Create another invitation to revoke
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/invitations`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'torevoke@example.com',
          role: 'READONLY',
        });

      const invitationToRevoke = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}/invitations/${invitationToRevoke}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});





