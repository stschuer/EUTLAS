import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SearchIndexesController (e2e)', () => {
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

    const uniqueEmail = `test-search-idx-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test SearchIdx',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test SearchIdx Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test SearchIdx Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-searchidx-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/search-indexes`;

  // ==================== Create Search Index ====================

  describe('POST .../search-indexes', () => {
    it('should create a search index', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-search-index',
          database: 'testdb',
          collection: 'articles',
          type: 'search',
          definition: {
            mappings: {
              dynamic: true,
              fields: {
                title: { type: 'string', analyzer: 'lucene.standard' },
                content: { type: 'string', analyzer: 'lucene.standard' },
                tags: { type: 'string', analyzer: 'lucene.keyword' },
              },
            },
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('test-search-index');
      expect(res.body.data).toHaveProperty('id');
      testIndexId = res.body.data.id;
    });

    it('should reject index without required fields', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'incomplete-index' })
        .expect(400);
    });
  });

  // ==================== List Search Indexes ====================

  describe('GET .../search-indexes', () => {
    it('should list search indexes', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter by database and collection', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}?database=testdb&collection=articles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Get Search Index Stats ====================

  describe('GET .../search-indexes/stats', () => {
    it('should return search index stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Get Available Analyzers ====================

  describe('GET .../search-indexes/analyzers', () => {
    it('should return available analyzers', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/analyzers`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Get Search Index ====================

  describe('GET .../search-indexes/:indexId', () => {
    it('should get search index details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testIndexId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testIndexId);
    });
  });

  // ==================== Update Search Index ====================

  describe('PATCH .../search-indexes/:indexId', () => {
    it('should update search index definition', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/${testIndexId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          definition: {
            mappings: {
              dynamic: false,
              fields: {
                title: { type: 'string', analyzer: 'lucene.standard' },
                content: { type: 'string', analyzer: 'lucene.english' },
              },
            },
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Test Search Index ====================

  describe('POST .../search-indexes/:indexId/test', () => {
    it('should test search index', async () => {
      // Wait for index rebuild after PATCH (buildIndex takes 2-5 seconds)
      const maxRetries = 10;
      let indexReady = false;
      for (let i = 0; i < maxRetries; i++) {
        const statusRes = await request(app.getHttpServer())
          .get(`${basePath()}/${testIndexId}`)
          .set('Authorization', `Bearer ${authToken}`);
        if (statusRes.body.data?.status === 'ready') {
          indexReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      expect(indexReady).toBe(true);

      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testIndexId}/test`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'test search query',
          limit: 10,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Delete Search Index ====================

  describe('DELETE .../search-indexes/:indexId', () => {
    it('should delete search index', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/${testIndexId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
