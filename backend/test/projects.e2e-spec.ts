import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('ProjectsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;

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

    // Create test user and get auth token
    const uniqueEmail = `test-projects-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Projects',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    // Create test organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Projects Org' });

    testOrgId = orgRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Create Project ====================

  describe('POST /orgs/:orgId/projects', () => {
    it('should create a project', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/projects`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Project',
          description: 'E2E test project',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Project');
      expect(res.body.data.description).toBe('E2E test project');
      expect(res.body.data).toHaveProperty('id');
      testProjectId = res.body.data.id;
    });

    it('should create a project without description', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/projects`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Minimal Project' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Minimal Project');
    });

    it('should reject project without name', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/projects`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No name project' })
        .expect(400);
    });
  });

  // ==================== List Projects ====================

  describe('GET /orgs/:orgId/projects', () => {
    it('should list projects in org', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/projects`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==================== Get Project ====================

  describe('GET /orgs/:orgId/projects/:projectId', () => {
    it('should get project by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testProjectId);
      expect(res.body.data.name).toBe('Test Project');
    });

    it('should return 404 for non-existent project', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/projects/000000000000000000000000`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ==================== Update Project ====================

  describe('PATCH /orgs/:orgId/projects/:projectId', () => {
    it('should update project name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Project Name' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Project Name');
    });

    it('should update project description', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${testOrgId}/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Updated description' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe('Updated description');
    });
  });

  // ==================== Delete Project ====================

  describe('DELETE /orgs/:orgId/projects/:projectId', () => {
    it('should delete a project', async () => {
      // Create a project to delete
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${testOrgId}/projects`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Project To Delete' });

      const projectToDelete = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${testOrgId}/projects/${projectToDelete}?force=true`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify project is deleted
      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${testOrgId}/projects/${projectToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
