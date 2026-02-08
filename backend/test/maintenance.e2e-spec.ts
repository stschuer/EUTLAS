import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('MaintenanceController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;
  let testWindowId: string;

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

    const uniqueEmail = `test-maint-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Maintenance',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Maintenance Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Maintenance Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-maint-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/maintenance`;

  // ==================== Create Maintenance Window ====================

  describe('POST .../maintenance', () => {
    it('should create a maintenance window', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Weekly Maintenance',
          description: 'Regular maintenance window',
          dayOfWeek: 'sunday',
          startHour: 2,
          durationHours: 2,
          timezone: 'Europe/Berlin',
          autoDeferEnabled: true,
          maxDeferDays: 7,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Weekly Maintenance');
      expect(res.body.data.dayOfWeek).toBe('sunday');
      expect(res.body.data).toHaveProperty('id');
      testWindowId = res.body.data.id;
    });

    it('should reject maintenance window without required fields', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Incomplete Window' })
        .expect(400);
    });
  });

  // ==================== List Maintenance Windows ====================

  describe('GET .../maintenance', () => {
    it('should list maintenance windows', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Upcoming Windows ====================

  describe('GET .../maintenance/upcoming', () => {
    it('should return upcoming maintenance windows', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/upcoming`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support days parameter', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/upcoming?days=14`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Maintenance History ====================

  describe('GET .../maintenance/history', () => {
    it('should return maintenance history', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Get Window Details ====================

  describe('GET .../maintenance/:windowId', () => {
    it('should get window details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testWindowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testWindowId);
    });
  });

  // ==================== Update Window ====================

  describe('PATCH .../maintenance/:windowId', () => {
    it('should update maintenance window', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/${testWindowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Maintenance Window',
          startHour: 3,
          durationHours: 3,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Maintenance Window');
    });
  });

  // ==================== Defer Window ====================

  describe('POST .../maintenance/:windowId/defer', () => {
    it('should defer maintenance window', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testWindowId}/defer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ days: 3, reason: 'Critical deployment in progress' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Emergency Maintenance ====================

  describe('POST .../maintenance/emergency', () => {
    it('should schedule emergency maintenance', async () => {
      const scheduledTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      const res = await request(app.getHttpServer())
        .post(`${basePath()}/emergency`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Emergency Security Patch',
          description: 'Critical security vulnerability fix',
          scheduledStartTime: scheduledTime,
          estimatedDurationMinutes: 30,
          requiresDowntime: true,
          affectedComponents: ['database', 'replication'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Cancel Window ====================

  describe('DELETE .../maintenance/:windowId', () => {
    it('should cancel maintenance window', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/${testWindowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'No longer needed' })
        .expect(200);
    });
  });
});
