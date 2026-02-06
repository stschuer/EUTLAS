import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ClusterSettingsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
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

    const uniqueEmail = `test-settings-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Settings',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Settings Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Settings Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-settings-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/settings`;

  // ==================== Get Settings ====================

  describe('GET .../settings', () => {
    it('should return cluster settings', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ==================== Update Settings ====================

  describe('PATCH .../settings', () => {
    it('should update cluster settings', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          readPreference: 'secondaryPreferred',
          profilingLevel: 1,
          slowOpThresholdMs: 200,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should update connection pool settings', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          connectionPool: {
            minPoolSize: 5,
            maxPoolSize: 100,
            maxIdleTimeMS: 30000,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Tags ====================

  describe('GET .../settings/tags', () => {
    it('should return cluster tags', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/tags`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('PATCH .../settings/tags', () => {
    it('should update cluster tags', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/tags`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tags: {
            environment: 'test',
            team: 'engineering',
            cost_center: 'cc-001',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST .../settings/tags/:key', () => {
    it('should add a tag', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/tags/project`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ value: 'eutlas' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE .../settings/tags/:key', () => {
    it('should remove a tag', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/tags/project`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== Labels ====================

  describe('GET .../settings/labels', () => {
    it('should return cluster labels', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/labels`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('PATCH .../settings/labels', () => {
    it('should update cluster labels', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/labels`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ labels: ['production', 'critical', 'eu-region'] })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Connection Pool ====================

  describe('GET .../settings/connection-pool', () => {
    it('should return connection pool settings', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/connection-pool`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Scheduled Scaling ====================

  let scheduledScalingId: string;

  describe('POST .../settings/scheduled-scaling', () => {
    it('should add a scheduled scaling rule', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/scheduled-scaling`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Business Hours Scale Up',
          enabled: true,
          cronSchedule: '0 8 * * 1-5',
          targetPlan: 'MEDIUM',
          timezone: 'Europe/Berlin',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      scheduledScalingId = res.body.data.id || res.body.data.schedules?.[0]?.id;
    });
  });

  describe('GET .../settings/scheduled-scaling', () => {
    it('should return scheduled scaling rules', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/scheduled-scaling`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('PATCH .../settings/scheduled-scaling/:scheduleId', () => {
    it('should update scheduled scaling rule', async () => {
      if (scheduledScalingId) {
        const res = await request(app.getHttpServer())
          .patch(`${basePath()}/scheduled-scaling/${scheduledScalingId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Updated Scale Rule', enabled: false })
          .expect(200);

        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('DELETE .../settings/scheduled-scaling/:scheduleId', () => {
    it('should delete scheduled scaling rule', async () => {
      if (scheduledScalingId) {
        await request(app.getHttpServer())
          .delete(`${basePath()}/scheduled-scaling/${scheduledScalingId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
      }
    });
  });
});
