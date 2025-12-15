import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('PerformanceAdvisorController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;

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
    const uniqueEmail = `test-perf-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Performance',
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
      .send({ name: 'Test Performance Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Project', description: 'For performance tests' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'perf-test-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Stats ====================

  describe('GET /performance/stats', () => {
    it('should return performance statistics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalSlowQueries');
      expect(res.body.data).toHaveProperty('avgExecutionTime');
      expect(res.body.data).toHaveProperty('topCollections');
      expect(res.body.data).toHaveProperty('collectionScans');
      expect(res.body.data).toHaveProperty('pendingSuggestions');
    });

    it('should accept days parameter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/stats?days=14`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Slow Queries ====================

  describe('GET /performance/slow-queries', () => {
    it('should return slow queries list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/slow-queries`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should accept filter parameters', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/slow-queries?database=test&minExecutionTimeMs=100`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Query Analysis ====================

  describe('POST /performance/explain', () => {
    it('should explain a query', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/explain`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          database: 'eutlas',
          collection: 'users',
          query: { email: 'test@example.com' },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('queryPlanner');
      expect(res.body.data.queryPlanner).toHaveProperty('winningPlan');
    });

    it('should accept sort parameter', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/explain`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          database: 'eutlas',
          collection: 'clusters',
          query: {},
          sort: { createdAt: -1 },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /performance/analyze', () => {
    it('should analyze a query and return recommendations', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/analyze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          database: 'eutlas',
          collection: 'users',
          query: { email: 'test@example.com' },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('isOptimal');
      expect(res.body.data).toHaveProperty('usesIndex');
      expect(res.body.data).toHaveProperty('collectionScan');
      expect(res.body.data).toHaveProperty('docsExamined');
      expect(res.body.data).toHaveProperty('docsReturned');
      expect(res.body.data).toHaveProperty('efficiency');
      expect(res.body.data).toHaveProperty('suggestions');
    });
  });

  // ==================== Index Suggestions ====================

  describe('GET /performance/suggestions', () => {
    it('should return index suggestions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/suggestions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/suggestions?status=pending`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Profiler ====================

  describe('GET /performance/profiler/:database', () => {
    it('should return profiler status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/profiler/eutlas`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('was');
      expect(res.body.data).toHaveProperty('slowms');
    });
  });

  describe('PATCH /performance/profiler/:database', () => {
    it('should set profiler level', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/profiler/eutlas`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          level: 'slow',
          slowMs: 100,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject invalid level', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/performance/profiler/eutlas`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          level: 'invalid',
        })
        .expect(400);
    });
  });
});





