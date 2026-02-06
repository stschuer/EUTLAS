import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const uniqueEmail = `test-auth-${Date.now()}@example.com`;
  const password = 'TestPassword123!';

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
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Signup ====================

  describe('POST /auth/signup', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          email: uniqueEmail,
          password,
          firstName: 'Test',
          lastName: 'Auth',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.email).toBe(uniqueEmail);
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          email: uniqueEmail,
          password,
          firstName: 'Test',
          lastName: 'Duplicate',
        })
        .expect(409);
    });

    it('should reject invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          email: 'not-an-email',
          password,
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          email: `weak-pw-${Date.now()}@example.com`,
          password: '123',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);
    });

    it('should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          email: `missing-fields-${Date.now()}@example.com`,
        })
        .expect(400);
    });
  });

  // ==================== Login ====================

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: uniqueEmail,
          password,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.accessToken.length).toBeGreaterThan(0);
    });

    it('should reject invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: uniqueEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password,
        })
        .expect(401);
    });

    it('should reject missing credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });
  });

  // ==================== Forgot Password ====================

  describe('POST /auth/forgot-password', () => {
    it('should accept valid email for password reset', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: uniqueEmail })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should not reveal if email exists (non-existent email)', async () => {
      // Should still return success to avoid email enumeration
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      // Should return 201 or 200 regardless
      expect([200, 201]).toContain(res.status);
    });
  });

  // ==================== Reset Password ====================

  describe('POST /auth/reset-password', () => {
    it('should reject invalid reset token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123!',
        })
        .expect(400);
    });
  });

  // ==================== Verify Email ====================

  describe('POST /auth/verify-email', () => {
    it('should reject invalid verification token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token' })
        .expect(400);
    });
  });

  // ==================== Protected Routes ====================

  describe('Protected routes', () => {
    it('should reject requests without auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orgs')
        .expect(401);
    });

    it('should reject requests with invalid auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orgs')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
