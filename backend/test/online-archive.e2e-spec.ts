import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('OnlineArchiveController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;
  let testRuleId: string;

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

    const uniqueEmail = `test-archive-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Archive',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Archive Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Archive Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-archive-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/archive`;

  // ==================== Create Archive Rule ====================

  describe('POST .../archive/rules', () => {
    it('should create an archive rule', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Archive Old Logs',
          database: 'testdb',
          collection: 'logs',
          dateField: 'createdAt',
          archiveAfterDays: 90,
          partitionFields: ['type', 'level'],
          storageClass: 'standard',
          compressionType: 'gzip',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Archive Old Logs');
      expect(res.body.data.archiveAfterDays).toBe(90);
      expect(res.body.data).toHaveProperty('id');
      testRuleId = res.body.data.id;
    });

    it('should reject rule without required fields', async () => {
      await request(app.getHttpServer())
        .post(`${basePath()}/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Incomplete Rule' })
        .expect(400);
    });
  });

  // ==================== List Archive Rules ====================

  describe('GET .../archive/rules', () => {
    it('should list archive rules', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Archive Stats ====================

  describe('GET .../archive/stats', () => {
    it('should return archive statistics', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ==================== Get Rule ====================

  describe('GET .../archive/rules/:ruleId', () => {
    it('should get rule details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/rules/${testRuleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testRuleId);
    });
  });

  // ==================== Update Rule ====================

  describe('PATCH .../archive/rules/:ruleId', () => {
    it('should update archive rule', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/rules/${testRuleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Archive Rule',
          archiveAfterDays: 60,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Archive Rule');
      expect(res.body.data.archiveAfterDays).toBe(60);
    });
  });

  // ==================== Pause/Resume Rule ====================

  describe('POST .../archive/rules/:ruleId/pause', () => {
    it('should pause archive rule', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/rules/${testRuleId}/pause`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST .../archive/rules/:ruleId/resume', () => {
    it('should resume archive rule', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/rules/${testRuleId}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Run Archive Now ====================

  describe('POST .../archive/rules/:ruleId/run', () => {
    it('should trigger archive run', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/rules/${testRuleId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Delete Rule ====================

  describe('DELETE .../archive/rules/:ruleId', () => {
    it('should delete archive rule', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/rules/${testRuleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
