import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SsoController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testSsoConfigId: string;

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

    const uniqueEmail = `test-sso-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'SSO',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test SSO Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Create SSO Config ====================

  describe('POST /sso/orgs/:orgId/configs', () => {
    it('should create a SAML SSO config', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sso/orgs/${testOrgId}/configs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test SAML Config',
          type: 'saml',
          enabled: false,
          emailDomains: ['testcorp.com'],
          saml: {
            entryPoint: 'https://idp.testcorp.com/sso/saml',
            issuer: 'urn:testcorp:idp',
            cert: 'MIIDpDCCAoygAwIBAgIGAXoKMeEHMA0GCSqGSIb3DQEBCwUA',
          },
          defaultRole: 'MEMBER',
          allowJitProvisioning: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test SAML Config');
      expect(res.body.data.type).toBe('saml');
      expect(res.body.data.enabled).toBe(false);
      expect(res.body.data.emailDomains).toContain('testcorp.com');
      testSsoConfigId = res.body.data.id;
    });

    it('should create an OIDC SSO config', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sso/orgs/${testOrgId}/configs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test OIDC Config',
          type: 'oidc',
          enabled: false,
          emailDomains: ['oidccorp.com'],
          oidc: {
            provider: 'google',
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
          },
          defaultRole: 'MEMBER',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('oidc');
    });

    it('should reject invalid SSO type', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sso/orgs/${testOrgId}/configs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Config',
          type: 'invalid',
        })
        .expect(400);
    });
  });

  // ==================== List SSO Configs ====================

  describe('GET /sso/orgs/:orgId/configs', () => {
    it('should list SSO configs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sso/orgs/${testOrgId}/configs`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==================== Get SSO Config ====================

  describe('GET /sso/orgs/:orgId/configs/:configId', () => {
    it('should get SSO config details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sso/orgs/${testOrgId}/configs/${testSsoConfigId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testSsoConfigId);
      expect(res.body.data.name).toBe('Test SAML Config');
    });
  });

  // ==================== Update SSO Config ====================

  describe('PUT /sso/orgs/:orgId/configs/:configId', () => {
    it('should update SSO config', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/sso/orgs/${testOrgId}/configs/${testSsoConfigId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated SAML Config',
          enabled: true,
          emailDomains: ['testcorp.com', 'newdomain.com'],
          saml: {
            entryPoint: 'https://idp.testcorp.com/sso/saml',
            issuer: 'urn:testcorp:idp',
            cert: 'MIIDpDCCAoygAwIBAgIGAXoKMeEHMA0GCSqGSIb3DQEBCwUA',
          },
          defaultRole: 'ADMIN',
          allowJitProvisioning: true,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated SAML Config');
      expect(res.body.data.emailDomains).toContain('newdomain.com');
    });
  });

  // ==================== SSO Discovery ====================

  describe('GET /sso/discover', () => {
    it('should discover SSO config by email domain', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sso/discover?email=user@testcorp.com')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should return empty for unknown domain', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sso/discover?email=user@unknown-domain.com')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Delete SSO Config ====================

  describe('DELETE /sso/orgs/:orgId/configs/:configId', () => {
    it('should delete SSO config', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/sso/orgs/${testOrgId}/configs/${testSsoConfigId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
