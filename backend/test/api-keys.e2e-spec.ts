import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ApiKeysController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testApiKeyId: string;
  let testApiKeyPublic: string;
  let testApiKeySecret: string;

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
    const uniqueEmail = `test-apikey-${Date.now()}@example.com`;
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
      .send({ name: 'Test API Keys Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orgs/:orgId/api-keys', () => {
    it('should create an API key', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/api-keys`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Key',
          description: 'E2E test key',
          scopes: ['clusters:read', 'projects:read'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Key');
      expect(res.body.data.publicKey).toMatch(/^eutlas_pk_/);
      expect(res.body.data.secretKey).toMatch(/^eutlas_sk_/);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.scopes).toContain('clusters:read');

      testApiKeyId = res.body.data.id;
      testApiKeyPublic = res.body.data.publicKey;
      testApiKeySecret = res.body.data.secretKey;
    });

    it('should reject without name', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/api-keys`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['clusters:read'],
        })
        .expect(400);
    });
  });

  describe('GET /orgs/:orgId/api-keys', () => {
    it('should list API keys', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/api-keys`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Secret key should not be returned in list
      expect(res.body.data[0].secretKey).toBeUndefined();
      expect(res.body.data[0].keyHash).toBeUndefined();
    });
  });

  describe('GET /orgs/:orgId/api-keys/:apiKeyId', () => {
    it('should get API key details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testApiKeyId);
      expect(res.body.data.publicKey).toBe(testApiKeyPublic);
      expect(res.body.data.secretKey).toBeUndefined();
    });
  });

  describe('PATCH /orgs/:orgId/api-keys/:apiKeyId', () => {
    it('should update API key', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Key Name',
          scopes: ['clusters:read', 'clusters:write'],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Key Name');
      expect(res.body.data.scopes).toContain('clusters:write');
    });

    it('should disable API key', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          isActive: false,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);
    });
  });

  describe('GET /orgs/:orgId/api-keys/scopes/available', () => {
    it('should return available scopes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/api-keys/scopes/available`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('scope');
      expect(res.body.data[0]).toHaveProperty('description');
    });
  });

  describe('DELETE /orgs/:orgId/api-keys/:apiKeyId', () => {
    it('should delete API key', async () => {
      // Create a key to delete
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/api-keys`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Key to Delete',
          scopes: ['clusters:read'],
        });

      const keyToDelete = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}/api-keys/${keyToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify deleted
      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/api-keys/${keyToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});





