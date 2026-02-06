import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('VectorSearchController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;
  let testIndexId: string;

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

    const uniqueEmail = `test-vector-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Vector',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Vector Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Vector Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-vector-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/vector-search`;

  // ==================== Create Vector Index ====================

  describe('POST .../vector-search/indexes', () => {
    it('should create a vector search index', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/indexes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-vector-index',
          database: 'testdb',
          collection: 'documents',
          vectorFields: [
            { path: 'embedding', dimensions: 1536, similarity: 'cosine' },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('test-vector-index');
      expect(res.body.data).toHaveProperty('id');
      testIndexId = res.body.data.id;
    });

    it('should reject index without vector fields', async () => {
      await request(app.getHttpServer())
        .post(`${basePath()}/indexes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'invalid-index',
          database: 'testdb',
          collection: 'documents',
        })
        .expect(400);
    });
  });

  // ==================== List Vector Indexes ====================

  describe('GET .../vector-search/indexes', () => {
    it('should list vector search indexes', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/indexes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Vector Index ====================

  describe('GET .../vector-search/indexes/:indexId', () => {
    it('should get vector index details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/indexes/${testIndexId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testIndexId);
      expect(res.body.data.name).toBe('test-vector-index');
    });
  });

  // ==================== Analyzers & Models ====================

  describe('GET .../vector-search/analyzers', () => {
    it('should return available analyzers', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/analyzers`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET .../vector-search/embedding-models', () => {
    it('should return supported embedding models', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/embedding-models`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Rebuild Index ====================

  describe('POST .../vector-search/indexes/:indexId/rebuild', () => {
    it('should trigger index rebuild', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/indexes/${testIndexId}/rebuild`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Delete Vector Index ====================

  describe('DELETE .../vector-search/indexes/:indexId', () => {
    it('should delete vector index', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/indexes/${testIndexId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
