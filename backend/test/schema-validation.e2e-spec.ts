import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SchemaValidationController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;
  let testSchemaId: string;

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

    const uniqueEmail = `test-schemas-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Schemas',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Schemas Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Schemas Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-schemas-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () =>
    `/api/v1/projects/${testProjectId}/clusters/${testClusterId}/schemas`;

  // ==================== Schema Templates ====================

  describe('GET .../schemas/templates', () => {
    it('should return schema templates', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/templates`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Create Schema ====================

  describe('POST .../schemas', () => {
    it('should create a schema validation', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          database: 'testdb',
          collection: 'users',
          jsonSchema: {
            bsonType: 'object',
            required: ['name', 'email'],
            properties: {
              name: { bsonType: 'string', description: 'must be a string' },
              email: { bsonType: 'string', pattern: '@' },
              age: { bsonType: 'int', minimum: 0, maximum: 200 },
            },
          },
          validationLevel: 'strict',
          validationAction: 'error',
          description: 'User collection schema',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.database).toBe('testdb');
      expect(res.body.data.collection).toBe('users');
      expect(res.body.data).toHaveProperty('id');
      testSchemaId = res.body.data.id;
    });

    it('should reject schema without required fields', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          database: 'testdb',
        })
        .expect(400);
    });
  });

  // ==================== List Schemas ====================

  describe('GET .../schemas', () => {
    it('should list schemas', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Schema ====================

  describe('GET .../schemas/:schemaId', () => {
    it('should get schema details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testSchemaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testSchemaId);
    });
  });

  // ==================== Update Schema ====================

  describe('PATCH .../schemas/:schemaId', () => {
    it('should update schema', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/${testSchemaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          validationLevel: 'moderate',
          description: 'Updated schema description',
          comment: 'Relaxed validation',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.validationLevel).toBe('moderate');
    });
  });

  // ==================== Validate Document ====================

  describe('POST .../schemas/:schemaId/validate', () => {
    it('should validate a valid document', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testSchemaId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          document: { name: 'John Doe', email: 'john@example.com', age: 30 },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should reject an invalid document', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testSchemaId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          document: { age: 'not-a-number' },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      // The response should indicate validation failure
      expect(res.body.data).toHaveProperty('valid');
    });
  });

  describe('POST .../schemas/:schemaId/validate-bulk', () => {
    it('should validate multiple documents', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testSchemaId}/validate-bulk`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          documents: [
            { name: 'John Doe', email: 'john@example.com' },
            { name: 'Jane Doe', email: 'jane@example.com' },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Generate Schema ====================

  describe('POST .../schemas/generate', () => {
    it('should generate schema from sample documents', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sampleDocuments: [
            { name: 'John', email: 'john@test.com', age: 25, active: true },
            { name: 'Jane', email: 'jane@test.com', age: 30, active: false },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('jsonSchema');
    });
  });

  // ==================== Schema History ====================

  describe('GET .../schemas/:schemaId/history', () => {
    it('should return schema version history', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testSchemaId}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==================== Delete Schema ====================

  describe('DELETE .../schemas/:schemaId', () => {
    it('should delete schema', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/${testSchemaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
