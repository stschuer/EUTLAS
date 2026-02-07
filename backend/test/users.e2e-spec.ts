import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  const userPassword = 'TestPassword123!';
  let userEmail: string;

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

    userEmail = `test-users-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: userEmail,
        password: userPassword,
        firstName: 'Test',
        lastName: 'User',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password: userPassword });

    authToken = loginRes.body.data.accessToken;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== Get Profile ====================

  describe('GET /users/me', () => {
    it('should return current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('email');
      expect(res.body.data.email).toBe(userEmail);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);
    });

    it('should reject with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalidtoken123')
        .expect(401);
    });
  });

  // ==================== Update Profile ====================

  describe('PATCH /users/me', () => {
    it('should update user name', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should reject update without auth', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ name: 'Hack Name' })
        .expect(401);
    });
  });

  // ==================== Change Password ====================

  describe('POST /users/me/password', () => {
    const newPassword = 'NewPassword456!';

    it('should reject without current password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newPassword })
        .expect(400);
    });

    it('should reject with wrong current password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword,
        });

      // Should fail with 400 or 401
      expect([400, 401]).toContain(res.status);
    });

    it('should change password successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: userPassword,
          newPassword,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password changed');

      // Verify new password works for login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: userEmail, password: newPassword });

      expect(loginRes.status).toBe(201);
      authToken = loginRes.body.data.accessToken;
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/me/password')
        .send({
          currentPassword: 'any',
          newPassword: 'AnyPassword123!',
        })
        .expect(401);
    });
  });

  // ==================== Delete Account ====================

  describe('DELETE /users/me', () => {
    it('should reject without password confirmation', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should reject with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'WrongPassword123!' });

      expect([400, 401]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/me')
        .send({ password: 'any' })
        .expect(401);
    });
  });
});
