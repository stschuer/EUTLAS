import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GdprController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testRequestId: string;

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
    const uniqueEmail = `test-gdpr-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'GDPR',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    // Create test organization
    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test GDPR Org' });

    testOrgId = orgRes.body.data.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () => `/api/v1/orgs/${testOrgId}/gdpr`;

  // ==================== Create Data Subject Request ====================

  describe('POST .../gdpr/requests', () => {
    it('should create an access request (Art. 15)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'access',
          requestorEmail: 'data-subject@example.com',
          requestorName: 'Max Mustermann',
          subjectEmail: 'data-subject@example.com',
          description: 'I want to know what personal data you store about me.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('access');
      expect(res.body.status).toBe('pending');
      expect(res.body.subjectEmail).toBe('data-subject@example.com');
      expect(res.body).toHaveProperty('dueDate');
      testRequestId = res.body.id;
    });

    it('should create an erasure request (Art. 17)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'erasure',
          requestorEmail: 'delete-me@example.com',
          requestorName: 'Erika Musterfrau',
          subjectEmail: 'delete-me@example.com',
          description: 'Please delete all my personal data according to Art. 17 GDPR.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('erasure');
      expect(res.body.status).toBe('pending');
    });

    it('should create a portability request (Art. 20)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'portability',
          requestorEmail: 'portable@example.com',
          requestorName: 'Hans Export',
          subjectEmail: 'portable@example.com',
          description: 'I need a copy of my data in a machine-readable format.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('portability');
    });

    it('should create a rectification request (Art. 16)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'rectification',
          requestorEmail: 'fix-me@example.com',
          requestorName: 'Fix My Data',
          subjectEmail: 'fix-me@example.com',
          description: 'My address is incorrect, please correct it.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('rectification');
    });
  });

  // ==================== List GDPR Requests ====================

  describe('GET .../gdpr/requests', () => {
    it('should list all GDPR requests for the organization', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(4); // We created 4 above
    });
  });

  // ==================== Get Overdue Requests ====================

  describe('GET .../gdpr/requests/overdue', () => {
    it('should return overdue requests (none expected in fresh test)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/requests/overdue`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Freshly created requests should not be overdue (30 day deadline)
      expect(res.body.length).toBe(0);
    });
  });

  // ==================== Get Request Details ====================

  describe('GET .../gdpr/requests/:requestId', () => {
    it('should get GDPR request details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/requests/${testRequestId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(testRequestId);
      expect(res.body.type).toBe('access');
      expect(res.body.status).toBe('pending');
      expect(res.body).toHaveProperty('requestorEmail');
      expect(res.body).toHaveProperty('subjectEmail');
      expect(res.body).toHaveProperty('description');
      expect(res.body).toHaveProperty('dueDate');
    });
  });

  // ==================== Process Request ====================

  describe('POST .../gdpr/requests/:requestId/process', () => {
    it('should process an access request', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/requests/${testRequestId}/process`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Should return collected data or processing confirmation
      expect(res.body).toBeDefined();
    });
  });
});
