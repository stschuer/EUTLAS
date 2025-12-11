import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MetricsController (e2e)', () => {
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
    const uniqueEmail = `test-metrics-${Date.now()}@example.com`;
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
      .send({ name: 'Test Metrics Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Metrics Project' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-metrics-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready and some metrics to be collected
    await new Promise((resolve) => setTimeout(resolve, 5000));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /projects/:projectId/clusters/:clusterId/metrics', () => {
    it('should get all metrics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/metrics`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('cpu');
      expect(res.body.data).toHaveProperty('memory');
      expect(res.body.data).toHaveProperty('storage');
      expect(res.body.data).toHaveProperty('connections');
      expect(res.body.data).toHaveProperty('operations');
      expect(res.body.data).toHaveProperty('network');
      expect(res.body.period).toBe('24h');
    });

    it('should support different periods', async () => {
      const periods = ['1h', '6h', '24h', '7d', '30d'];
      
      for (const period of periods) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/metrics?period=${period}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.period).toBe(period);
      }
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/metrics`)
        .expect(401);
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/metrics/current', () => {
    it('should get current metrics', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/metrics/current`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Might be null if no metrics collected yet
      if (res.body.data) {
        expect(res.body.data).toHaveProperty('cpu');
        expect(res.body.data).toHaveProperty('memory');
        expect(res.body.data).toHaveProperty('storageUsed');
        expect(res.body.data).toHaveProperty('storageAvailable');
        expect(res.body.data).toHaveProperty('connectionsCurrent');
        expect(res.body.data).toHaveProperty('connectionsAvailable');
        expect(res.body.data).toHaveProperty('operationsPerSec');
        expect(res.body.data).toHaveProperty('networkIn');
        expect(res.body.data).toHaveProperty('networkOut');
        expect(res.body.data).toHaveProperty('lastUpdated');
      }
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/metrics/:metricType', () => {
    it('should get specific metric type', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/metrics/cpu_usage`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.metricType).toBe('cpu_usage');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support aggregation parameter', async () => {
      const aggregations = ['avg', 'max', 'min', 'sum'];
      
      for (const agg of aggregations) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/metrics/cpu_usage?aggregation=${agg}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.aggregation).toBe(agg);
      }
    });
  });
});



