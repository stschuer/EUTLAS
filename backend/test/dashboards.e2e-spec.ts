import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('DashboardsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testDashboardId: string;
  let testWidgetId: string;

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

    const uniqueEmail = `test-dashboards-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Dashboards',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Dashboards Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Dashboard Templates ====================

  describe('GET /orgs/:orgId/dashboards/templates', () => {
    it('should return dashboard templates', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/dashboards/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Create Dashboard ====================

  describe('POST /orgs/:orgId/dashboards', () => {
    it('should create a dashboard', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/dashboards`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Dashboard',
          description: 'E2E test dashboard',
          widgets: [
            {
              id: 'widget-1',
              title: 'CPU Usage',
              type: 'line_chart',
              metrics: ['cpu_usage'],
              position: { x: 0, y: 0, width: 6, height: 4 },
            },
          ],
          timeRange: '24h',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Dashboard');
      expect(res.body.data).toHaveProperty('id');
      testDashboardId = res.body.data.id;
    });

    it('should reject dashboard without name', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/dashboards`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No name dashboard' })
        .expect(400);
    });
  });

  // ==================== List Dashboards ====================

  describe('GET /orgs/:orgId/dashboards', () => {
    it('should list dashboards', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/dashboards`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Dashboard ====================

  describe('GET /orgs/:orgId/dashboards/:dashboardId', () => {
    it('should get dashboard details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testDashboardId);
    });
  });

  // ==================== Update Dashboard ====================

  describe('PATCH /orgs/:orgId/dashboards/:dashboardId', () => {
    it('should update dashboard', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Dashboard',
          timeRange: '7d',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Dashboard');
    });
  });

  // ==================== Widgets ====================

  describe('POST /orgs/:orgId/dashboards/:dashboardId/widgets', () => {
    it('should add a widget', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}/widgets`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id: 'widget-2',
          title: 'Memory Usage',
          type: 'gauge',
          metrics: ['memory_usage'],
          position: { x: 6, y: 0, width: 6, height: 4 },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      testWidgetId = res.body.data.id || 'widget-2';
    });
  });

  describe('PATCH /orgs/:orgId/dashboards/:dashboardId/widgets/:widgetId', () => {
    it('should update a widget', async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}/widgets/${testWidgetId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Memory Widget' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /orgs/:orgId/dashboards/:dashboardId/widgets/:widgetId', () => {
    it('should remove a widget', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}/widgets/${testWidgetId}`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== Duplicate Dashboard ====================

  describe('POST /orgs/:orgId/dashboards/:dashboardId/duplicate', () => {
    it('should duplicate dashboard', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}/duplicate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Duplicated Dashboard' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Duplicated Dashboard');
    });
  });

  // ==================== Delete Dashboard ====================

  describe('DELETE /orgs/:orgId/dashboards/:dashboardId', () => {
    it('should delete dashboard', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}/dashboards/${testDashboardId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
