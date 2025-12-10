import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('DatabaseUsersController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;
  let testDbUserId: string;

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
    const uniqueEmail = `test-dbusers-${Date.now()}@example.com`;
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
      .send({ name: 'Test DB Users Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test DB Users Project' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-dbusers-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /projects/:projectId/clusters/:clusterId/users', () => {
    it('should create a database user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'test_user',
          password: 'SecurePassword123!',
          roles: [{ role: 'readWrite', db: 'testdb' }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('test_user');
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.roles).toHaveLength(1);
      testDbUserId = res.body.data.id;
    });

    it('should reject duplicate username', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'test_user',
          password: 'AnotherPassword123!',
          roles: [{ role: 'read', db: 'testdb' }],
        })
        .expect(409);
    });

    it('should reject invalid username format', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: '123invalid',
          password: 'SecurePassword123!',
          roles: [{ role: 'readWrite', db: 'testdb' }],
        })
        .expect(400);
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'another_user',
          password: 'weak',
          roles: [{ role: 'readWrite', db: 'testdb' }],
        })
        .expect(400);
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/users', () => {
    it('should list database users', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /projects/:projectId/clusters/:clusterId/users/:userId', () => {
    it('should get user details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/${testDbUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testDbUserId);
      expect(res.body.data.username).toBe('test_user');
      // Password hash should not be returned
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/000000000000000000000000`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /projects/:projectId/clusters/:clusterId/users/:userId', () => {
    it('should update user roles', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/${testDbUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          roles: [{ role: 'readWrite', db: 'testdb' }, { role: 'read', db: 'otherdb' }],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.roles).toHaveLength(2);
    });

    it('should update user password', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/${testDbUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          password: 'NewSecurePassword456!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should disable user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/${testDbUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          isActive: false,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);
    });
  });

  describe('DELETE /projects/:projectId/clusters/:clusterId/users/:userId', () => {
    it('should delete user', async () => {
      // First create a new user to delete
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: 'user_to_delete',
          password: 'SecurePassword123!',
          roles: [{ role: 'read', db: 'testdb' }],
        });

      const userToDeleteId = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/${userToDeleteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify user is deleted
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/users/${userToDeleteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});


