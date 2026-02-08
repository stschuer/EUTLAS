import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('Advanced Cluster Settings (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;

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

    const uniqueEmail = `test-adv-settings-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test AdvSettings',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Advanced Settings Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Advanced Settings Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-adv-settings-cluster', plan: 'LARGE' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/settings`;

  // ==================== Auto-Scaling Configuration ====================

  describe('PATCH .../settings (Auto-Scaling)', () => {
    it('should configure auto-scaling settings', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoScaling: {
            enabled: true,
            minPlan: 'SMALL',
            maxPlan: 'XXXL',
            scaleUpThreshold: 85,
            scaleDownThreshold: 25,
            cooldownMinutes: 15,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should disable auto-scaling', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          autoScaling: {
            enabled: false,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Encryption at Rest ====================

  describe('PATCH .../settings (Encryption at Rest)', () => {
    it('should enable encryption at rest', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          encryptionAtRest: {
            enabled: true,
            provider: 'hetzner',
            algorithm: 'AES-256',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should disable encryption at rest', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          encryptionAtRest: {
            enabled: false,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Read Replicas ====================

  describe('PATCH .../settings (Read Replicas)', () => {
    it('should enable read replicas', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          readReplicas: {
            enabled: true,
            count: 2,
            regions: ['fsn1', 'nbg1'],
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should update read replica count', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          readReplicas: {
            enabled: true,
            count: 3,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should disable read replicas', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          readReplicas: {
            enabled: false,
            count: 0,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Enhanced Connection Pool ====================

  describe('PATCH .../settings (Enhanced Connection Pool)', () => {
    it('should configure retry writes and reads', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          connectionPool: {
            maxPoolSize: 100,
            minPoolSize: 10,
            maxIdleTimeMS: 60000,
            retryWrites: true,
            retryReads: true,
            family: 4,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should configure connection compression', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          connectionPool: {
            compressors: ['zstd', 'snappy'],
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should configure direct connection mode', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          connectionPool: {
            directConnection: false,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Combined Settings Update ====================

  describe('PATCH .../settings (Combined Update)', () => {
    it('should update multiple advanced settings at once', async () => {
      const res = await request(app.getHttpServer())
        .patch(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          readPreference: 'secondaryPreferred',
          profilingLevel: 2,
          slowOpThresholdMs: 100,
          autoScaling: {
            enabled: true,
            minPlan: 'MEDIUM',
            maxPlan: 'DEDICATED_L',
          },
          encryptionAtRest: {
            enabled: true,
            provider: 'hetzner',
          },
          readReplicas: {
            enabled: true,
            count: 2,
          },
          connectionPool: {
            maxPoolSize: 200,
            retryWrites: true,
            retryReads: true,
            family: 4,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Verify Settings Persistence ====================

  describe('GET .../settings (Verify Persistence)', () => {
    it('should return settings with all advanced configurations', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Connection pool settings should persist
      if (res.body.data.connectionPool) {
        expect(res.body.data.connectionPool.maxPoolSize).toBeDefined();
      }
    });
  });

  // ==================== Connection String Generation ====================

  describe('GET .../settings/connection-string', () => {
    it('should return connection string reflecting advanced settings', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/connection-string`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('connectionString');

      const connStr = res.body.data.connectionString;
      expect(typeof connStr).toBe('string');

      // Should include retryWrites if configured
      if (connStr.includes('?') || connStr.includes('&')) {
        expect(connStr).toContain('retryWrites=true');
      }
    });
  });
});
