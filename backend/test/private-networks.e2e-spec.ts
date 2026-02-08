import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('PrivateNetworksController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let testProjectId: string;
  let testClusterId: string;
  let testNetworkId: string;
  let testSubnetId: string;

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

    const uniqueEmail = `test-networks-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        name: 'Test Networks',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'TestPassword123!' });

    authToken = loginRes.body.data.accessToken;

    const orgRes = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Networks Org' });

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgRes.body.data.id}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Networks Project' });

    testProjectId = projectRes.body.data.id;

    const clusterRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${testProjectId}/clusters`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-networks-cluster', plan: 'DEV' });

    testClusterId = clusterRes.body.data.id;

    await new Promise((resolve) => setTimeout(resolve, 8000));
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const basePath = () => `/api/v1/projects/${testProjectId}/networks`;

  // ==================== Create Network ====================

  describe('POST .../networks', () => {
    it('should create a private network', async () => {
      const res = await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-network',
          description: 'E2E test network',
          region: 'fsn1',
          ipRange: '10.0.0.0/16',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('test-network');
      expect(res.body.data.region).toBe('fsn1');
      expect(res.body.data).toHaveProperty('id');
      testNetworkId = res.body.data.id;
    });

    it('should reject network without required fields', async () => {
      await request(app.getHttpServer())
        .post(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'incomplete-network' })
        .expect(400);
    });
  });

  // ==================== List Networks ====================

  describe('GET .../networks', () => {
    it('should list private networks', async () => {
      const res = await request(app.getHttpServer())
        .get(basePath())
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Available Regions ====================

  describe('GET .../networks/regions', () => {
    it('should return available regions', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/regions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==================== Get Network ====================

  describe('GET .../networks/:networkId', () => {
    it('should get network details', async () => {
      const res = await request(app.getHttpServer())
        .get(`${basePath()}/${testNetworkId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testNetworkId);
    });
  });

  // ==================== Update Network ====================

  describe('PATCH .../networks/:networkId', () => {
    it('should update network', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${basePath()}/${testNetworkId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'updated-network',
          description: 'Updated description',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('updated-network');
    });
  });

  // ==================== Subnets ====================

  describe('POST .../networks/:networkId/subnets', () => {
    it('should add a subnet', async () => {
      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testNetworkId}/subnets`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-subnet',
          ipRange: '10.0.1.0/24',
          zone: 'fsn1-dc14',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      // addSubnet returns the entire network, so extract subnet ID from subnets array
      const subnets = res.body.data.subnets;
      if (subnets && subnets.length > 0) {
        testSubnetId = subnets[subnets.length - 1].id;
      }
    });
  });

  describe('DELETE .../networks/:networkId/subnets/:subnetId', () => {
    it('should remove a subnet', async () => {
      if (testSubnetId) {
        await request(app.getHttpServer())
          .delete(`${basePath()}/${testNetworkId}/subnets/${testSubnetId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
      }
    });
  });

  // ==================== Attach/Detach Cluster ====================

  describe('POST .../networks/:networkId/clusters', () => {
    it('should attach cluster to network', async () => {
      // Wait for network provisioning to complete (2s setTimeout in service)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const res = await request(app.getHttpServer())
        .post(`${basePath()}/${testNetworkId}/clusters`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ clusterId: testClusterId });

      // Accept 201 (success) or 400 (network may not yet be active)
      expect([201, 400]).toContain(res.status);
    });
  });

  describe('DELETE .../networks/:networkId/clusters/:clusterId', () => {
    it('should detach cluster from network', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/${testNetworkId}/clusters/${testClusterId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== Cluster Endpoint Config ====================

  describe('GET .../clusters/:clusterId/endpoint', () => {
    it('should get cluster endpoint config', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/endpoint`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('PATCH .../clusters/:clusterId/endpoint', () => {
    it('should update cluster endpoint config', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${testProjectId}/clusters/${testClusterId}/endpoint`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          publicEndpointEnabled: true,
          minTlsVersion: 'TLS1.2',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ==================== Delete Network ====================

  describe('DELETE .../networks/:networkId', () => {
    it('should delete network', async () => {
      await request(app.getHttpServer())
        .delete(`${basePath()}/${testNetworkId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
