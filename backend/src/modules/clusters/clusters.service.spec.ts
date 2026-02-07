/**
 * Unit tests for ClustersService.
 * Focuses on the buildConnectionString private method (tested via findByIdWithCredentials)
 * and lifecycle state management.
 */
import { ClustersService } from './clusters.service';

describe('ClustersService', () => {
  let service: ClustersService;
  let mockClusterModel: any;
  let mockJobsService: any;
  let mockCredentialsService: any;
  let mockConnection: any;

  beforeEach(() => {
    mockClusterModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    // Make find() and findById() chainable with .exec()
    const createChainable = (value: any) => ({
      sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
      exec: jest.fn().mockResolvedValue(value),
    });

    mockJobsService = {
      createJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    mockCredentialsService = {
      generateCredentials: jest.fn().mockResolvedValue({
        raw: { username: 'admin', password: 'secret123' },
        encrypted: 'encrypted-data',
      }),
      decryptCredentials: jest.fn().mockResolvedValue({
        username: 'admin',
        password: 'secret123',
      }),
    };

    mockConnection = {};

    service = new ClustersService(
      mockClusterModel as any,
      mockJobsService,
      mockCredentialsService,
      mockConnection,
    );
  });

  // ==================== buildConnectionString ====================

  describe('buildConnectionString (via findByIdWithCredentials)', () => {
    it('should return "pending" when cluster has no connectionHost', async () => {
      const cluster = {
        id: 'cluster-1',
        name: 'test-cluster',
        connectionHost: null,
        connectionPort: null,
        srvHost: null,
        replicaSetName: null,
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-1');

      expect(result).toBeDefined();
      expect(result!.credentials.connectionString).toBe('pending');
    });

    it('should build standard mongodb:// connection string', async () => {
      const cluster = {
        id: 'cluster-1',
        name: 'my-db',
        connectionHost: 'mongo.example.com',
        connectionPort: 27017,
        srvHost: null,
        replicaSetName: null,
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-1');

      const connStr = result!.credentials.connectionString;
      expect(connStr).toContain('mongodb://admin:secret123@mongo.example.com:27017/my-db');
      expect(connStr).toContain('authSource=admin');
      expect(connStr).toContain('retryWrites=true');
      expect(connStr).toContain('w=majority');
    });

    it('should build mongodb+srv:// connection string when srvHost is present', async () => {
      const cluster = {
        id: 'cluster-2',
        name: 'prod-db',
        connectionHost: 'mongo.example.com',
        connectionPort: 27017,
        srvHost: 'cluster2.eutlas.eu',
        replicaSetName: 'rs0',
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-2');

      const connStr = result!.credentials.connectionString;
      expect(connStr).toContain('mongodb+srv://admin:secret123@cluster2.eutlas.eu/prod-db');
      expect(connStr).toContain('authSource=admin');
      expect(connStr).toContain('retryWrites=true');
      expect(connStr).toContain('w=majority');
      expect(connStr).toContain('replicaSet=rs0');
    });

    it('should include replicaSet in standard connection string when set', async () => {
      const cluster = {
        id: 'cluster-3',
        name: 'rs-db',
        connectionHost: 'node1.example.com',
        connectionPort: 27018,
        srvHost: null,
        replicaSetName: 'myReplicaSet',
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-3');

      const connStr = result!.credentials.connectionString;
      expect(connStr).toContain('mongodb://');
      expect(connStr).toContain(':27018/');
      expect(connStr).toContain('replicaSet=myReplicaSet');
    });

    it('should return null when cluster is not found', async () => {
      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findByIdWithCredentials('nonexistent');
      expect(result).toBeNull();
    });

    it('should default to port 27017 when connectionPort is not set', async () => {
      const cluster = {
        id: 'cluster-4',
        name: 'default-port-db',
        connectionHost: 'mongo.example.com',
        connectionPort: undefined,
        srvHost: null,
        replicaSetName: null,
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-4');

      expect(result!.credentials.connectionString).toContain(':27017/');
      expect(result!.credentials.port).toBe(27017);
    });
  });

  // ==================== findByIdWithCredentials metadata ====================

  describe('findByIdWithCredentials metadata', () => {
    it('should return host and port alongside connection string', async () => {
      const cluster = {
        id: 'cluster-5',
        name: 'meta-db',
        connectionHost: 'host.example.com',
        connectionPort: 27019,
        srvHost: null,
        replicaSetName: null,
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-5');

      expect(result!.credentials.host).toBe('host.example.com');
      expect(result!.credentials.port).toBe(27019);
      expect(result!.credentials.username).toBe('admin');
      expect(result!.credentials.password).toBe('secret123');
      expect(result!.cluster).toBe(cluster);
    });

    it('should return "pending" for host when connectionHost is null', async () => {
      const cluster = {
        id: 'cluster-6',
        name: 'no-host-db',
        connectionHost: null,
        connectionPort: null,
        srvHost: null,
        replicaSetName: null,
        credentialsEncrypted: 'encrypted',
      };

      mockClusterModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(cluster),
      });

      const result = await service.findByIdWithCredentials('cluster-6');

      expect(result!.credentials.host).toBe('pending');
    });
  });
});
