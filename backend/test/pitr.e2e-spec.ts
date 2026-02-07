import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('PitrController (e2e)', () => {
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

    const uniqueEmail = `test-pitr-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'PITR',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test PITR Org' });

    testOrgId = orgRes.body.data.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test PITR Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-pitr-cluster', plan: 'MEDIUM' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/pitr`;

  // ==================== Get PITR Config ====================

  describe('GET .../pitr/config', () => {
    it('should return PITR config (disabled by default)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .get(`${basePath()}/config`)
        .expect(401);
    });
  });

  // ==================== Enable PITR ====================

  describe('POST .../pitr/enable', () => {
    it('should enable PITR', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/enable`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          retentionHours: 72,
          captureIntervalMinutes: 10,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('enabled');
    });
  });

  // ==================== Update PITR Config ====================

  describe('PUT .../pitr/config', () => {
    it('should update PITR configuration', async () => {
      const res = await request(app.getHttpServer())
        .put(`${basePath()}/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          retentionHours: 168,
          captureIntervalMinutes: 5,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Get Restore Window ====================

  describe('GET .../pitr/window', () => {
    it('should return the restore window', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/window`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ==================== Get Oplog Stats ====================

  describe('GET .../pitr/oplog/stats', () => {
    it('should return oplog statistics', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/oplog/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ==================== Create Restore ====================

  describe('POST .../pitr/restore', () => {
    let restoreId: string;

    it('should initiate a point-in-time restore', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/restore`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetTimestamp: new Date(Date.now() - 3600000).toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('restore');
      if (res.body.data?.id) {
        restoreId = res.body.data.id;
      }
    });

    // ==================== Get Restore Status ====================

    describe('GET .../pitr/restore/:restoreId', () => {
      it('should get restore status', async () => {
        if (!restoreId) return;

        const res = await request(app.getHttpServer())
          .get(`${basePath()}/restore/${restoreId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).toBe(true);
      });

      it('should return 404 for non-existent restore', async () => {
        await request(app.getHttpServer())
          .get(`${basePath()}/restore/000000000000000000000000`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });

    // ==================== Get Restore History ====================

    describe('GET .../pitr/restore', () => {
      it('should return restore history', async () => {
        const res = await request(app.getHttpServer())
          .get(`${basePath()}/restore`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      });
    });

    // ==================== Cancel Restore ====================

    describe('DELETE .../pitr/restore/:restoreId', () => {
      it('should cancel a restore', async () => {
        if (!restoreId) return;

        const res = await request(app.getHttpServer())
          .delete(`${basePath()}/restore/${restoreId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).toBe(true);
      });
    });
  });

  // ==================== Disable PITR ====================

  describe('POST .../pitr/disable', () => {
    it('should disable PITR', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/disable`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('disabled');
    });
  });
});
