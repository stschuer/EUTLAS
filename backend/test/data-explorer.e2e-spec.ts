import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('DataExplorerController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testOrgId: string;
  let testProjectId: string;
  let testClusterId: string;

  const testDbName = 'test_explorer_db';
  const testCollName = 'test_explorer_coll';
  let insertedDocId: string;

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
    const uniqueEmail = `test-explorer-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Explorer',
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
      .send({ name: 'Test Explorer Org' });

    testOrgId = orgRes.body.data.id;

    // Create test project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${testOrgId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Project', description: 'For explorer tests' });

    testProjectId = projectRes.body.data.id;

    // Create test cluster
    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'explorer-test-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    // Wait for cluster to be ready (simulated - in dev it's instant)
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 60000);

  afterAll(async () => {
    // Cleanup: drop test database if it exists
    try {
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}`)
        .set('Authorization', `Bearer ${authToken}`);
    } catch {
      // Ignore cleanup errors
    }
    await app.close();
  });

  // ==================== Databases ====================

  describe('GET /explorer/databases', () => {
    it('should list databases', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /explorer/databases', () => {
    it('should create a database', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: testDbName })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Collections ====================

  describe('GET /explorer/databases/:db/collections', () => {
    it('should list collections', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /explorer/databases/:db/collections', () => {
    it('should create a collection', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: testCollName })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Documents ====================

  describe('POST /explorer/databases/:db/collections/:coll/documents', () => {
    it('should insert a document', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/documents`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          document: {
            name: 'Test Document',
            email: 'test@explorer.com',
            count: 42,
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.insertedId).toBeDefined();
      insertedDocId = res.body.data.insertedId;
    });
  });

  describe('POST /explorer/databases/:db/collections/:coll/find', () => {
    it('should query documents', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/find`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ filter: {}, limit: 10 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.documents).toBeDefined();
      expect(res.body.data.totalCount).toBeGreaterThan(0);
      expect(res.body.data.executionTime).toBeDefined();
    });

    it('should filter documents', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/find`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ filter: { name: 'Test Document' }, limit: 10 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.documents.length).toBeGreaterThan(0);
      expect(res.body.data.documents[0].name).toBe('Test Document');
    });
  });

  describe('GET /explorer/databases/:db/collections/:coll/documents/:id', () => {
    it('should get document by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/documents/${insertedDocId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(insertedDocId);
      expect(res.body.data.name).toBe('Test Document');
    });
  });

  describe('PUT /explorer/databases/:db/collections/:coll/documents/:id', () => {
    it('should update a document', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/documents/${insertedDocId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          document: {
            name: 'Updated Document',
            email: 'updated@explorer.com',
            count: 100,
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.modifiedCount).toBe(1);
    });
  });

  // ==================== Indexes ====================

  describe('GET /explorer/databases/:db/collections/:coll/indexes', () => {
    it('should list indexes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/indexes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should at least have _id_ index
      expect(res.body.data.some((idx: any) => idx.name === '_id_')).toBe(true);
    });
  });

  describe('POST /explorer/databases/:db/collections/:coll/indexes', () => {
    it('should create an index', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/indexes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          keys: { email: 1 },
          unique: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.indexName).toBeDefined();
    });
  });

  // ==================== Cleanup ====================

  describe('DELETE /explorer/databases/:db/collections/:coll/documents/:id', () => {
    it('should delete a document', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}/documents/${insertedDocId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.deletedCount).toBe(1);
    });
  });

  describe('DELETE /explorer/databases/:db/collections/:coll', () => {
    it('should drop a collection', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}/collections/${testCollName}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /explorer/databases/:db', () => {
    it('should drop a database', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/explorer/databases/${testDbName}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});




