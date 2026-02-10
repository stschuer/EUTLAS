import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as k8s from '@kubernetes/client-node';

// ========== Interfaces ==========

interface CreateClusterParams {
  clusterId: string;
  projectId: string;
  orgId: string;
  clusterName: string;
  plan: string;
  mongoVersion: string;
  region?: string;
  vectorSearchEnabled?: boolean;
  credentials: {
    username: string;
    password: string;
  };
}

interface ResizeClusterParams {
  clusterId: string;
  projectId: string;
  newPlan: string;
}

interface DeleteClusterParams {
  clusterId: string;
  projectId: string;
}

interface PauseClusterParams {
  clusterId: string;
  projectId: string;
  plan: string;
}

interface ResumeClusterParams {
  clusterId: string;
  projectId: string;
  plan: string; // needed to determine replica count and operator vs StatefulSet path
}

interface ClusterConnectionInfo {
  host: string;
  port: number;
  replicaSet?: string;
  srv?: string;
  externalHost?: string;
  externalPort?: number;
  qdrant?: {
    host: string;
    port: number;
  };
}

interface CreateDatabaseUserParams {
  clusterId: string;
  projectId: string;
  plan: string;
  username: string;
  password: string;
  roles: { role: string; db: string }[];
}

interface UpdateDatabaseUserParams {
  clusterId: string;
  projectId: string;
  plan: string;
  username: string;
  password?: string;
  roles?: { role: string; db: string }[];
  isActive?: boolean;
}

interface DeleteDatabaseUserParams {
  clusterId: string;
  projectId: string;
  plan: string;
  username: string;
}

interface UpdateNetworkPolicyParams {
  clusterId: string;
  projectId: string;
  allowedCidrs: string[];
}

interface BackupParams {
  clusterId: string;
  projectId: string;
  plan: string;
  backupId: string;
  storageClass?: string;
}

export interface ClusterStatus {
  phase: string;
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  message?: string;
}

// ========== Plan Configurations ==========

export const PLAN_RESOURCES: Record<string, { 
  cpu: string; 
  memory: string; 
  storage: string;
  replicas: number;
  cpuLimit: string;
  memoryLimit: string;
}> = {
  // Plans aligned with ClusterPlan enum in cluster.schema.ts / create-cluster.dto.ts
  DEV: { cpu: '50m', memory: '128Mi', storage: '1Gi', replicas: 1, cpuLimit: '200m', memoryLimit: '256Mi' },
  SMALL: { cpu: '100m', memory: '256Mi', storage: '5Gi', replicas: 1, cpuLimit: '500m', memoryLimit: '512Mi' },
  MEDIUM: { cpu: '150m', memory: '512Mi', storage: '10Gi', replicas: 1, cpuLimit: '750m', memoryLimit: '1Gi' },
  LARGE: { cpu: '250m', memory: '1Gi', storage: '25Gi', replicas: 3, cpuLimit: '1000m', memoryLimit: '2Gi' },
  XLARGE: { cpu: '500m', memory: '2Gi', storage: '50Gi', replicas: 3, cpuLimit: '2000m', memoryLimit: '4Gi' },
  XXL: { cpu: '1000m', memory: '4Gi', storage: '100Gi', replicas: 3, cpuLimit: '2000m', memoryLimit: '8Gi' },
  XXXL: { cpu: '2000m', memory: '8Gi', storage: '250Gi', replicas: 3, cpuLimit: '4000m', memoryLimit: '16Gi' },
  DEDICATED_L: { cpu: '4000m', memory: '8Gi', storage: '250Gi', replicas: 3, cpuLimit: '8000m', memoryLimit: '16Gi' },
  DEDICATED_XL: { cpu: '8000m', memory: '16Gi', storage: '500Gi', replicas: 3, cpuLimit: '16000m', memoryLimit: '32Gi' },
};

// Qdrant companion service resource sizing (opt-in, only when vectorSearchEnabled)
export const QDRANT_RESOURCES: Record<string, {
  cpu: string;
  memory: string;
  storage: string;
  cpuLimit: string;
  memoryLimit: string;
}> = {
  DEV: { cpu: '100m', memory: '256Mi', storage: '1Gi', cpuLimit: '200m', memoryLimit: '512Mi' },
  SMALL: { cpu: '200m', memory: '512Mi', storage: '5Gi', cpuLimit: '500m', memoryLimit: '1Gi' },
  MEDIUM: { cpu: '250m', memory: '1Gi', storage: '10Gi', cpuLimit: '750m', memoryLimit: '2Gi' },
  LARGE: { cpu: '500m', memory: '2Gi', storage: '25Gi', cpuLimit: '1000m', memoryLimit: '4Gi' },
  XLARGE: { cpu: '1000m', memory: '4Gi', storage: '50Gi', cpuLimit: '2000m', memoryLimit: '8Gi' },
  XXL: { cpu: '1000m', memory: '4Gi', storage: '100Gi', cpuLimit: '2000m', memoryLimit: '8Gi' },
  XXXL: { cpu: '2000m', memory: '8Gi', storage: '250Gi', cpuLimit: '4000m', memoryLimit: '16Gi' },
  DEDICATED_L: { cpu: '4000m', memory: '16Gi', storage: '250Gi', cpuLimit: '8000m', memoryLimit: '32Gi' },
  DEDICATED_XL: { cpu: '8000m', memory: '32Gi', storage: '500Gi', cpuLimit: '16000m', memoryLimit: '64Gi' },
};

// MongoDB Community Operator CRD API Version
const MONGODB_API_VERSION = 'mongodbcommunity.mongodb.com/v1';
const MONGODB_KIND = 'MongoDBCommunity';

@Injectable()
export class KubernetesService implements OnModuleInit {
  private readonly logger = new Logger(KubernetesService.name);
  private readonly namespacePrefix: string;
  private kc: k8s.KubeConfig;
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private networkApi: k8s.NetworkingV1Api;
  private customApi: k8s.CustomObjectsApi;
  private rbacApi: k8s.RbacAuthorizationV1Api;
  private isConnected = false;
  private readonly devMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.namespacePrefix = this.configService.get<string>('K8S_NAMESPACE_PREFIX', 'eutlas-');
    this.devMode = this.configService.get<string>('NODE_ENV') !== 'production';
  }

  async onModuleInit() {
    await this.initializeKubeClient();
  }

  private async initializeKubeClient(): Promise<void> {
    try {
      this.kc = new k8s.KubeConfig();
      
      const inCluster = this.configService.get<boolean>('K8S_IN_CLUSTER', false);
      
      if (inCluster) {
        // Running inside Kubernetes
        this.kc.loadFromCluster();
        this.logger.log('Loaded Kubernetes config from cluster');
      } else {
        // Try to load from default location (~/.kube/config)
        try {
          this.kc.loadFromDefault();
          this.logger.log('Loaded Kubernetes config from default location');
        } catch (e) {
          if (!this.devMode) {
            throw e;
          }
          this.logger.warn('No Kubernetes config found - running in simulation mode');
          return;
        }
      }

      this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
      this.networkApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
      this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
      this.rbacApi = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);

      // Test connection
      if (!this.devMode) {
        await this.coreApi.listNamespace();
        this.isConnected = true;
        this.logger.log('Successfully connected to Kubernetes cluster');
      }
    } catch (error: any) {
      this.logger.error(`Failed to connect to Kubernetes: ${error.message}`);
      this.logger.warn('Falling back to simulation mode for Kubernetes operations');
      // Don't crash the app - fall back to simulation mode
      this.isConnected = false;
    }
  }

  // ========== Namespace Management ==========

  async ensureNamespace(projectId: string): Promise<string> {
    const namespace = this.getNamespace(projectId);

    if (this.shouldSimulate()) {
      this.logger.debug(`[SIM] Would create namespace: ${namespace}`);
      return namespace;
    }

    try {
      await this.coreApi.readNamespace(namespace);
      this.logger.debug(`Namespace ${namespace} already exists`);
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        // Create namespace
        await this.coreApi.createNamespace({
          metadata: {
            name: namespace,
            labels: {
              'eutlas.eu/managed-by': 'eutlas',
              'eutlas.eu/project-id': projectId,
            },
          },
        });
        this.logger.log(`Created namespace: ${namespace}`);
        
        // Create MongoDB service account and RBAC
        await this.createMongoDBRBAC(namespace);
      } else {
        throw error;
      }
    }

    return namespace;
  }

  private async createMongoDBRBAC(namespace: string): Promise<void> {
    try {
      // Create mongodb-database service account
      await this.coreApi.createNamespacedServiceAccount(namespace, {
        metadata: { name: 'mongodb-database', namespace },
      });

      // Create Role for MongoDB
      await this.rbacApi.createNamespacedRole(namespace, {
        metadata: { name: 'mongodb-role', namespace },
        rules: [
          {
            apiGroups: [''],
            resources: ['secrets', 'pods', 'services', 'configmaps'],
            verbs: ['get', 'list', 'watch', 'create', 'update', 'patch'],
          },
        ],
      });

      // Create RoleBinding
      await this.rbacApi.createNamespacedRoleBinding(namespace, {
        metadata: { name: 'mongodb-binding', namespace },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: 'mongodb-role',
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: 'mongodb-database',
            namespace,
          },
        ],
      });

      this.logger.log(`Created MongoDB RBAC in namespace: ${namespace}`);
    } catch (error: any) {
      this.logger.warn(`Failed to create MongoDB RBAC: ${error.message}`);
    }
  }

  async deleteNamespace(projectId: string): Promise<void> {
    const namespace = this.getNamespace(projectId);

    if (this.shouldSimulate()) {
      this.logger.debug(`[SIM] Would delete namespace: ${namespace}`);
      return;
    }

    try {
      await this.coreApi.deleteNamespace(namespace);
      this.logger.log(`Deleted namespace: ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) {
        throw error;
      }
    }
  }

  // ========== MongoDB Cluster Management ==========

  async createMongoCluster(params: CreateClusterParams): Promise<ClusterConnectionInfo> {
    this.logger.log(`Creating MongoDB cluster ${params.clusterId} (${params.clusterName})`);

    const namespace = await this.ensureNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const resources = PLAN_RESOURCES[params.plan] || PLAN_RESOURCES.DEV;

    if (this.shouldSimulate()) {
      await this.simulateDelay(2000);
      const simInfo = this.getSimulatedConnectionInfo(resourceName, namespace);
      if (params.vectorSearchEnabled) {
        const qdrantName = `qdrant-${params.clusterId}`.toLowerCase();
        simInfo.qdrant = {
          host: `${qdrantName}.${namespace}.svc.cluster.local`,
          port: 6333,
        };
      }
      return simInfo;
    }

    try {
      // 1. Create Secret for MongoDB admin credentials
      await this.createCredentialsSecret(namespace, resourceName, params.credentials);

      // 2. Choose deployment strategy based on plan
      const useOperator = this.isOperatorManaged(params.plan);
      
      if (useOperator) {
        // Use MongoDB Operator for larger plans (replica sets)
        this.logger.log(`Using MongoDB Operator for plan ${params.plan}`);
        await this.createMongoDBCommunityResource(namespace, resourceName, {
          ...params,
          resources,
        });
      } else {
        // Use simple StatefulSet for DEV/SMALL plans (single node)
        this.logger.log(`Using simple StatefulSet for plan ${params.plan}`);
        await this.createSimpleMongoDBStatefulSet(namespace, resourceName, params.credentials, resources);
      }

      // 3. Create NetworkPolicy for security
      await this.createDefaultNetworkPolicy(namespace, resourceName);

      // 4. Create backup PVC for this cluster
      await this.ensureBackupPvc(namespace, resourceName);

      // 5. Create Qdrant companion service if vector search is enabled
      let qdrantInfo: { host: string; port: number } | undefined;
      if (params.vectorSearchEnabled) {
        const qdrantResources = QDRANT_RESOURCES[params.plan] || QDRANT_RESOURCES.DEV;
        const qdrantName = `qdrant-${params.clusterId}`.toLowerCase();
        qdrantInfo = await this.createQdrantStatefulSet(namespace, qdrantName, qdrantResources);
        this.logger.log(`Qdrant companion service created for cluster ${params.clusterId}`);
      }

      // 6. Create external NodePort service for outside-cluster connectivity
      const externalServiceName = `${resourceName}-external`;
      const podAppLabel = useOperator ? `${resourceName}-svc` : resourceName;
      await this.createExternalService(namespace, externalServiceName, resourceName, podAppLabel);

      // 7. Get external endpoint (node IP + assigned NodePort)
      const externalEndpoint = await this.getExternalEndpoint(namespace, externalServiceName);

      this.logger.log(`MongoDB cluster ${params.clusterId} creation initiated successfully`);

      const serviceName = this.getServiceName(resourceName, params.plan);
      return {
        host: `${serviceName}.${namespace}.svc.cluster.local`,
        port: 27017,
        replicaSet: useOperator ? resourceName : undefined,
        srv: useOperator ? `${serviceName}.${namespace}.svc.cluster.local` : undefined,
        externalHost: externalEndpoint?.host,
        externalPort: externalEndpoint?.port || 27017,
        qdrant: qdrantInfo,
      };
    } catch (error: any) {
      const errorDetails = error.response?.body || error.body || error.message;
      this.logger.error(`Failed to create MongoDB cluster: ${JSON.stringify(errorDetails)}`);
      throw error;
    }
  }

  private async createCredentialsSecret(
    namespace: string,
    resourceName: string,
    credentials: { username: string; password: string },
  ): Promise<void> {
    const secretName = `${resourceName}-admin-password`;

    try {
      await this.coreApi.readNamespacedSecret(secretName, namespace);
      // Secret exists, update it
      await this.coreApi.replaceNamespacedSecret(secretName, namespace, {
        metadata: {
          name: secretName,
          namespace,
          labels: {
            'eutlas.eu/managed-by': 'eutlas',
            'eutlas.eu/cluster': resourceName,
          },
        },
        type: 'Opaque',
        stringData: {
          password: credentials.password,
        },
      });
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        // Create new secret
        await this.coreApi.createNamespacedSecret(namespace, {
          metadata: {
            name: secretName,
            namespace,
            labels: {
              'eutlas.eu/managed-by': 'eutlas',
              'eutlas.eu/cluster': resourceName,
            },
          },
          type: 'Opaque',
          stringData: {
            password: credentials.password,
          },
        });
      } else {
        throw error;
      }
    }
  }

  private async createMongoDBCommunityResource(
    namespace: string,
    resourceName: string,
    params: CreateClusterParams & { resources: typeof PLAN_RESOURCES.DEV },
  ): Promise<void> {
    const mongoDBSpec = {
      apiVersion: MONGODB_API_VERSION,
      kind: MONGODB_KIND,
      metadata: {
        name: resourceName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster-id': params.clusterId,
          'eutlas.eu/org-id': params.orgId,
          'eutlas.eu/project-id': params.projectId,
          'eutlas.eu/plan': params.plan,
        },
        annotations: {
          'eutlas.eu/cluster-name': params.clusterName,
          'eutlas.eu/created-at': new Date().toISOString(),
        },
      },
      spec: {
        members: params.resources.replicas,
        type: 'ReplicaSet', // MongoDB Community Operator only supports ReplicaSet
        version: params.mongoVersion || '7.0.5',
        security: {
          authentication: {
            modes: ['SCRAM'],
          },
        },
        users: [
          {
            name: params.credentials.username,
            db: 'admin',
            passwordSecretRef: {
              name: `${resourceName}-admin-password`,
            },
            roles: [
              { name: 'clusterAdmin', db: 'admin' },
              { name: 'userAdminAnyDatabase', db: 'admin' },
              { name: 'readWriteAnyDatabase', db: 'admin' },
              { name: 'dbAdminAnyDatabase', db: 'admin' },
            ],
            scramCredentialsSecretName: `${resourceName}-scram`,
          },
        ],
        additionalMongodConfig: {
          'storage.wiredTiger.engineConfig.journalCompressor': 'zlib',
          'net.maxIncomingConnections': 1000,
        },
        statefulSet: {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    name: 'mongod',
                    resources: {
                      requests: {
                        cpu: params.resources.cpu,
                        memory: params.resources.memory,
                      },
                      limits: {
                        cpu: params.resources.cpuLimit,
                        memory: params.resources.memoryLimit,
                      },
                    },
                  },
                ],
              },
            },
            volumeClaimTemplates: [
              {
                metadata: {
                  name: 'data-volume',
                },
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  storageClassName: 'local-path',
                  resources: {
                    requests: {
                      storage: params.resources.storage,
                    },
                  },
                },
              },
              {
                metadata: {
                  name: 'logs-volume',
                },
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  storageClassName: 'local-path',
                  resources: {
                    requests: {
                      storage: '1Gi',
                    },
                  },
                },
              },
            ],
          },
        },
      },
    };

    try {
      await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      );
      // Resource exists, replace it
      await this.customApi.replaceNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
        mongoDBSpec,
      );
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        // Create new resource
        try {
          await this.customApi.createNamespacedCustomObject(
            'mongodbcommunity.mongodb.com',
            'v1',
            namespace,
            'mongodbcommunity',
            mongoDBSpec,
          );
          this.logger.log(`Created MongoDBCommunity resource ${resourceName} in ${namespace}`);
        } catch (createError: any) {
          this.logger.error(`Failed to create MongoDBCommunity: status=${createError.response?.statusCode}, body=${JSON.stringify(createError.response?.body || createError.body || createError.message)}`);
          throw createError;
        }
      } else {
        this.logger.error(`Failed to check MongoDBCommunity: status=${error.response?.statusCode}, body=${JSON.stringify(error.response?.body || error.body || error.message)}`);
        throw error;
      }
    }
  }

  private async createSimpleMongoDBStatefulSet(
    namespace: string,
    resourceName: string,
    credentials: { username: string; password: string },
    resources: typeof PLAN_RESOURCES.DEV,
  ): Promise<void> {
    // Create a simple StatefulSet for DEV/SMALL plans (single node, no operator)
    const secretName = `${resourceName}-admin-password`;

    // Create StatefulSet
    const statefulSet: k8s.V1StatefulSet = {
      metadata: {
        name: resourceName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          app: resourceName,
        },
      },
      spec: {
        serviceName: resourceName,
        replicas: 1,
        selector: {
          matchLabels: { app: resourceName },
        },
        template: {
          metadata: {
            labels: { app: resourceName },
          },
          spec: {
            containers: [
              {
                name: 'mongodb',
                image: 'mongo:7.0',
                ports: [{ containerPort: 27017 }],
                env: [
                  { name: 'MONGO_INITDB_ROOT_USERNAME', value: credentials.username },
                  { name: 'MONGO_INITDB_ROOT_PASSWORD', valueFrom: { secretKeyRef: { name: secretName, key: 'password' } } },
                ],
                resources: {
                  requests: { cpu: resources.cpu, memory: resources.memory },
                  limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
                },
                volumeMounts: [{ name: 'data', mountPath: '/data/db' }],
              },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            metadata: { name: 'data' },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'local-path',
              resources: { requests: { storage: resources.storage } },
            },
          },
        ],
      },
    };

    // Create Service
    const service: k8s.V1Service = {
      metadata: {
        name: resourceName,
        namespace,
        labels: { 'eutlas.eu/managed-by': 'eutlas', app: resourceName },
      },
      spec: {
        selector: { app: resourceName },
        ports: [{ port: 27017, targetPort: 27017 }],
        clusterIP: 'None', // Headless service for StatefulSet
      },
    };

    try {
      await this.appsApi.createNamespacedStatefulSet(namespace, statefulSet);
      this.logger.log(`Created StatefulSet ${resourceName} in ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) { // Ignore "already exists"
        this.logger.error(`Failed to create StatefulSet: ${JSON.stringify(error.response?.body || error.message)}`);
        throw error;
      }
    }

    try {
      await this.coreApi.createNamespacedService(namespace, service);
      this.logger.log(`Created Service ${resourceName} in ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) { // Ignore "already exists"
        this.logger.error(`Failed to create Service: ${JSON.stringify(error.response?.body || error.message)}`);
        throw error;
      }
    }
  }

  /**
   * Creates a NodePort Service to expose MongoDB externally.
   * NodePort works on any K8s cluster (including K3s on bare metal) without
   * requiring a cloud controller manager. The external endpoint is <node-ip>:<nodePort>.
   */
  private async createExternalService(
    namespace: string,
    externalServiceName: string,
    resourceName: string,
    podAppLabel?: string,
  ): Promise<void> {
    // The selector must match the pod's app label.
    // Operator-managed pods use `app=<resourceName>-svc`, StatefulSet pods use `app=<resourceName>`.
    const selectorLabel = podAppLabel || resourceName;
    const service: k8s.V1Service = {
      metadata: {
        name: externalServiceName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster': resourceName,
          'eutlas.eu/service-type': 'external-access',
          app: resourceName,
        },
      },
      spec: {
        type: 'NodePort',
        selector: { app: selectorLabel },
        ports: [{ name: 'mongodb', port: 27017, targetPort: 27017, protocol: 'TCP' }],
      },
    };

    try {
      await this.coreApi.createNamespacedService(namespace, service);
      this.logger.log(`Created external NodePort service ${externalServiceName} in ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) {
        this.logger.error(`Failed to create external service: ${JSON.stringify(error.response?.body || error.message)}`);
        throw error;
      }
      this.logger.log(`External service ${externalServiceName} already exists`);
    }
  }

  /**
   * Reads the NodePort service to get the assigned port, then resolves the
   * node's external IP. Returns { host, port } or null.
   */
  private async getExternalEndpoint(
    namespace: string,
    serviceName: string,
  ): Promise<{ host: string; port: number } | null> {
    try {
      // 1. Read the service to get the assigned NodePort
      const { body: svc } = await this.coreApi.readNamespacedService(serviceName, namespace);
      const nodePort = svc.spec?.ports?.[0]?.nodePort;

      if (!nodePort) {
        this.logger.warn(`NodePort not yet assigned for ${serviceName}`);
        return null;
      }

      // 2. Get the node's external IP
      const nodeIp = await this.getNodeExternalIp();
      if (!nodeIp) {
        this.logger.warn(`Could not determine node external IP`);
        return null;
      }

      this.logger.log(`External endpoint ready: ${nodeIp}:${nodePort}`);
      return { host: nodeIp, port: nodePort };
    } catch (error: any) {
      this.logger.warn(`Failed to resolve external endpoint for ${serviceName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Gets the external IP of a cluster node. Resolution order:
   * 1. NODE_EXTERNAL_IP env var (explicit override — most reliable)
   * 2. K8s node ExternalIP address
   * 3. K8s node InternalIP address (on Hetzner bare-metal K3s this IS the public IP)
   */
  private async getNodeExternalIp(): Promise<string | null> {
    // 1. Explicit override via environment variable (most reliable for bare-metal)
    const envIp = this.configService.get<string>('NODE_EXTERNAL_IP');
    if (envIp) {
      this.logger.log(`Using NODE_EXTERNAL_IP from environment: ${envIp}`);
      return envIp;
    }

    // 2. Query the K8s API for node addresses
    try {
      const { body: nodeList } = await this.coreApi.listNode();
      this.logger.log(`Found ${nodeList.items.length} node(s), checking addresses...`);

      for (const node of nodeList.items) {
        const addresses = node.status?.addresses || [];
        const nodeName = node.metadata?.name || 'unknown';
        this.logger.log(`Node ${nodeName} addresses: ${JSON.stringify(addresses.map(a => ({ type: a.type, address: a.address })))}`);

        // Prefer ExternalIP
        const external = addresses.find((a) => a.type === 'ExternalIP');
        if (external?.address) {
          this.logger.log(`Found ExternalIP on node ${nodeName}: ${external.address}`);
          return external.address;
        }
      }

      // 3. Fallback: use InternalIP (on Hetzner bare-metal, this is the public IP)
      for (const node of nodeList.items) {
        const internal = (node.status?.addresses || []).find((a) => a.type === 'InternalIP');
        if (internal?.address) {
          this.logger.log(`Using InternalIP as external address: ${internal.address}`);
          return internal.address;
        }
      }

      this.logger.warn('No usable node IP found in any node addresses');
    } catch (error: any) {
      this.logger.error(`Failed to list nodes (RBAC issue?): ${error.message}`);
      this.logger.error(`Make sure the backend's service account has permission to list nodes, or set NODE_EXTERNAL_IP env var`);
    }
    return null;
  }

  /**
   * Enables external access for an existing cluster that was created before
   * the external-access feature was added. Creates the NodePort service if
   * missing and returns the external endpoint.
   */
  async enableExternalAccess(
    clusterId: string,
    projectId: string,
    plan?: string,
  ): Promise<{ host: string; port: number } | null> {
    const namespace = this.getNamespace(projectId);
    const resourceName = this.getResourceName(clusterId);
    const externalServiceName = `${resourceName}-external`;

    if (this.shouldSimulate()) {
      return { host: '203.0.113.1', port: 30017 };
    }

    // Determine the correct pod app label based on deployment type
    const useOperator = plan ? this.isOperatorManaged(plan) : true; // default to operator for safety
    const podAppLabel = useOperator ? `${resourceName}-svc` : resourceName;

    // Create the NodePort service (idempotent — skips if already exists)
    await this.createExternalService(namespace, externalServiceName, resourceName, podAppLabel);

    // Read the endpoint
    return this.getExternalEndpoint(namespace, externalServiceName);
  }

  private async createDefaultNetworkPolicy(namespace: string, resourceName: string): Promise<void> {
    const policyName = `${resourceName}-network-policy`;

    const networkPolicy: k8s.V1NetworkPolicy = {
      metadata: {
        name: policyName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster': resourceName,
        },
      },
      spec: {
        podSelector: {
          matchLabels: {
            app: resourceName,
          },
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            // Allow from same namespace by default
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    name: namespace,
                  },
                },
              },
            ],
            ports: [
              { protocol: 'TCP', port: 27017 },
            ],
          },
        ],
      },
    };

    try {
      await this.networkApi.createNamespacedNetworkPolicy(namespace, networkPolicy);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) { // Ignore if already exists
        throw error;
      }
    }
  }

  async resizeMongoCluster(params: ResizeClusterParams & { currentPlan?: string }): Promise<void> {
    this.logger.log(`Resizing cluster ${params.clusterId} to ${params.newPlan}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const resources = PLAN_RESOURCES[params.newPlan] || PLAN_RESOURCES.DEV;

    if (this.shouldSimulate()) {
      await this.simulateDelay(1500);
      return;
    }

    const currentIsOperator = params.currentPlan ? this.isOperatorManaged(params.currentPlan) : false;
    const newIsOperator = this.isOperatorManaged(params.newPlan);

    // Block cross-path resizing (StatefulSet <-> Operator) as it requires migration
    if (params.currentPlan && currentIsOperator !== newIsOperator) {
      throw new Error(
        `Cannot resize between StatefulSet-based plans (DEV/SMALL) and Operator-managed plans (MEDIUM+). ` +
        `Please create a new cluster with the desired plan and migrate your data.`
      );
    }

    try {
      if (newIsOperator) {
        // Operator path: update the MongoDBCommunity CR
        const { body: current } = await this.customApi.getNamespacedCustomObject(
          'mongodbcommunity.mongodb.com',
          'v1',
          namespace,
          'mongodbcommunity',
          resourceName,
        ) as { body: any };

        current.metadata.labels['eutlas.eu/plan'] = params.newPlan;
        current.spec.members = resources.replicas;
        current.spec.statefulSet.spec.template.spec.containers[0].resources = {
          requests: { cpu: resources.cpu, memory: resources.memory },
          limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
        };

        await this.customApi.replaceNamespacedCustomObject(
          'mongodbcommunity.mongodb.com',
          'v1',
          namespace,
          'mongodbcommunity',
          resourceName,
          current,
        );
      } else {
        // StatefulSet path: patch the container resources directly
        const patch = {
          spec: {
            template: {
              spec: {
                containers: [{
                  name: 'mongodb',
                  resources: {
                    requests: { cpu: resources.cpu, memory: resources.memory },
                    limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
                  },
                }],
              },
            },
          },
        };

        await this.appsApi.patchNamespacedStatefulSet(
          resourceName,
          namespace,
          patch,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } },
        );
      }

      this.logger.log(`Cluster ${params.clusterId} resize initiated`);
    } catch (error: any) {
      this.logger.error(`Failed to resize cluster: ${error.message}`);
      throw error;
    }
  }

  async deleteMongoCluster(params: DeleteClusterParams): Promise<void> {
    this.logger.log(`Deleting cluster ${params.clusterId}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    if (this.shouldSimulate()) {
      await this.simulateDelay(1000);
      return;
    }

    try {
      // Delete MongoDBCommunity resource
      await this.customApi.deleteNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      );

      // Delete associated secrets
      const secrets = await this.coreApi.listNamespacedSecret(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `eutlas.eu/cluster=${resourceName}`,
      );

      for (const secret of secrets.body.items) {
        if (secret.metadata?.name) {
          await this.coreApi.deleteNamespacedSecret(secret.metadata.name, namespace);
        }
      }

      // Delete network policy
      try {
        await this.networkApi.deleteNamespacedNetworkPolicy(`${resourceName}-network-policy`, namespace);
      } catch (e) {
        // Ignore if not found
      }

      // Delete Qdrant companion service if it exists
      await this.deleteQdrantInstance(namespace, params.clusterId);

      // Delete simple StatefulSet + Service (DEV/SMALL plans)
      try {
        await this.appsApi.deleteNamespacedStatefulSet(resourceName, namespace);
      } catch (e: any) {
        if (e.response?.statusCode !== 404) {
          this.logger.warn(`Failed to delete StatefulSet ${resourceName}: ${e.message}`);
        }
      }
      try {
        await this.coreApi.deleteNamespacedService(resourceName, namespace);
      } catch (e: any) {
        if (e.response?.statusCode !== 404) {
          this.logger.warn(`Failed to delete Service ${resourceName}: ${e.message}`);
        }
      }

      // Delete external NodePort service
      try {
        await this.coreApi.deleteNamespacedService(`${resourceName}-external`, namespace);
        this.logger.log(`Deleted external service ${resourceName}-external`);
      } catch (e: any) {
        if (e.response?.statusCode !== 404) {
          this.logger.warn(`Failed to delete external service: ${e.message}`);
        }
      }

      this.logger.log(`Cluster ${params.clusterId} deleted`);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) {
        this.logger.error(`Failed to delete cluster: ${error.message}`);
        throw error;
      }
    }
  }

  async pauseMongoCluster(params: PauseClusterParams): Promise<void> {
    this.logger.log(`Pausing cluster ${params.clusterId}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    if (this.shouldSimulate()) {
      await this.simulateDelay(1500);
      return;
    }

    try {
      if (this.isOperatorManaged(params.plan)) {
        // Operator path: set spec.members to 0 so the operator scales down gracefully
        const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName,
        ) as { body: any };

        mongoDb.spec.members = 0;

        await this.customApi.replaceNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName, mongoDb,
        );
      } else {
        // StatefulSet path: scale directly
        const currentScale = await this.appsApi.readNamespacedStatefulSetScale(resourceName, namespace);
        if (currentScale.body.spec) {
          currentScale.body.spec.replicas = 0;
        }
        await this.appsApi.replaceNamespacedStatefulSetScale(resourceName, namespace, currentScale.body);
      }

      this.logger.log(`Cluster ${params.clusterId} paused (scaled to 0 replicas)`);
    } catch (error: any) {
      this.logger.error(`Failed to pause cluster: ${error.message}`);
      throw error;
    }
  }

  async resumeMongoCluster(params: ResumeClusterParams): Promise<void> {
    this.logger.log(`Resuming cluster ${params.clusterId}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const resources = PLAN_RESOURCES[params.plan] || PLAN_RESOURCES.DEV;

    if (this.shouldSimulate()) {
      await this.simulateDelay(2000);
      return;
    }

    try {
      if (this.isOperatorManaged(params.plan)) {
        // Operator path: restore spec.members so the operator scales up
        const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName,
        ) as { body: any };

        mongoDb.spec.members = resources.replicas;

        await this.customApi.replaceNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName, mongoDb,
        );
      } else {
        // StatefulSet path: scale directly
        const currentScale = await this.appsApi.readNamespacedStatefulSetScale(resourceName, namespace);
        if (currentScale.body.spec) {
          currentScale.body.spec.replicas = resources.replicas;
        }
        await this.appsApi.replaceNamespacedStatefulSetScale(resourceName, namespace, currentScale.body);
      }

      this.logger.log(`Cluster ${params.clusterId} resumed (scaled to ${resources.replicas} replicas)`);
    } catch (error: any) {
      this.logger.error(`Failed to resume cluster: ${error.message}`);
      throw error;
    }
  }

  // ========== Database User Management ==========

  async createDatabaseUser(params: CreateDatabaseUserParams): Promise<void> {
    this.logger.log(`Creating database user ${params.username} for cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(500);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    try {
      if (this.isOperatorManaged(params.plan)) {
        // Operator path: create secret + update MongoDBCommunity CR
        const secretName = `${resourceName}-user-${params.username}`;
        
        await this.coreApi.createNamespacedSecret(namespace, {
          metadata: {
            name: secretName,
            namespace,
            labels: {
              'eutlas.eu/managed-by': 'eutlas',
              'eutlas.eu/cluster': resourceName,
              'eutlas.eu/user': params.username,
            },
          },
          type: 'Opaque',
          stringData: { password: params.password },
        });

        const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName,
        ) as { body: any };

        mongoDb.spec.users = mongoDb.spec.users || [];
        mongoDb.spec.users.push({
          name: params.username,
          db: 'admin',
          passwordSecretRef: { name: secretName },
          roles: params.roles.map(r => ({ name: r.role, db: r.db })),
          scramCredentialsSecretName: `${resourceName}-${params.username}-scram`,
        });

        await this.customApi.replaceNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName, mongoDb,
        );
      } else {
        // StatefulSet path: exec mongosh to create user directly
        const rolesJson = JSON.stringify(params.roles.map(r => ({ role: r.role, db: r.db })));
        const escapedPassword = params.password.replace(/'/g, "\\'");
        const cmd = `mongosh --quiet --eval "db.getSiblingDB('admin').createUser({user:'${params.username}',pwd:'${escapedPassword}',roles:${rolesJson}})"`;
        await this.execInMongoPod(namespace, resourceName, cmd);
      }

      this.logger.log(`Database user ${params.username} created`);
    } catch (error: any) {
      this.logger.error(`Failed to create database user: ${error.message}`);
      throw error;
    }
  }

  async updateDatabaseUser(params: UpdateDatabaseUserParams): Promise<void> {
    this.logger.log(`Updating database user ${params.username} for cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(500);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    try {
      if (this.isOperatorManaged(params.plan)) {
        // Operator path: update secret + MongoDBCommunity CR
        if (params.password) {
          const secretName = `${resourceName}-user-${params.username}`;
          const currentSecret = await this.coreApi.readNamespacedSecret(secretName, namespace);
          currentSecret.body.stringData = { password: params.password };
          await this.coreApi.replaceNamespacedSecret(secretName, namespace, currentSecret.body);
        }

        if (params.roles) {
          const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
            'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName,
          ) as { body: any };

          const userIndex = mongoDb.spec.users.findIndex((u: any) => u.name === params.username);
          if (userIndex !== -1) {
            mongoDb.spec.users[userIndex].roles = params.roles.map(r => ({ name: r.role, db: r.db }));
            await this.customApi.replaceNamespacedCustomObject(
              'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName, mongoDb,
            );
          }
        }
      } else {
        // StatefulSet path: exec mongosh to update user directly
        if (params.password) {
          const escapedPassword = params.password.replace(/'/g, "\\'");
          const cmd = `mongosh --quiet --eval "db.getSiblingDB('admin').changeUserPassword('${params.username}','${escapedPassword}')"`;
          await this.execInMongoPod(namespace, resourceName, cmd);
        }
        if (params.roles) {
          const rolesJson = JSON.stringify(params.roles.map(r => ({ role: r.role, db: r.db })));
          const cmd = `mongosh --quiet --eval "db.getSiblingDB('admin').updateUser('${params.username}',{roles:${rolesJson}})"`;
          await this.execInMongoPod(namespace, resourceName, cmd);
        }
      }

      this.logger.log(`Database user ${params.username} updated`);
    } catch (error: any) {
      this.logger.error(`Failed to update database user: ${error.message}`);
      throw error;
    }
  }

  async deleteDatabaseUser(params: DeleteDatabaseUserParams): Promise<void> {
    this.logger.log(`Deleting database user ${params.username} from cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(300);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    try {
      if (this.isOperatorManaged(params.plan)) {
        // Operator path: delete secret + remove from CRD
        const secretName = `${resourceName}-user-${params.username}`;
        try {
          await this.coreApi.deleteNamespacedSecret(secretName, namespace);
        } catch (e: any) {
          if (e.response?.statusCode !== 404) throw e;
        }

        const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName,
        ) as { body: any };

        mongoDb.spec.users = mongoDb.spec.users.filter((u: any) => u.name !== params.username);

        await this.customApi.replaceNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName, mongoDb,
        );
      } else {
        // StatefulSet path: exec mongosh to drop user directly
        const cmd = `mongosh --quiet --eval "db.getSiblingDB('admin').dropUser('${params.username}')"`;
        await this.execInMongoPod(namespace, resourceName, cmd);
      }

      this.logger.log(`Database user ${params.username} deleted`);
    } catch (error: any) {
      this.logger.error(`Failed to delete database user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a command in the first running MongoDB pod of a StatefulSet cluster.
   * Used for direct mongosh operations on DEV/SMALL plans.
   */
  private async execInMongoPod(namespace: string, resourceName: string, command: string): Promise<string> {
    const podName = `${resourceName}-0`; // StatefulSet pod naming convention
    const exec = new k8s.Exec(this.kc);
    
    return new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      exec.exec(
        namespace,
        podName,
        'mongodb',
        ['/bin/sh', '-c', command],
        {
          write: (data: string) => { stdout += data; },
        } as any,
        {
          write: (data: string) => { stderr += data; },
        } as any,
        null,
        false,
        (status: k8s.V1Status) => {
          if (status.status === 'Success') {
            resolve(stdout);
          } else {
            reject(new Error(`Exec failed: ${stderr || status.message || 'unknown error'}`));
          }
        },
      ).catch(reject);
    });
  }

  // ========== Network Policy Management ==========

  async updateNetworkPolicy(params: UpdateNetworkPolicyParams): Promise<void> {
    this.logger.log(`Updating network policy for cluster ${params.clusterId}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const policyName = `${resourceName}-network-policy`;

    if (this.shouldSimulate()) {
      await this.simulateDelay(300);
      return;
    }

    try {
      const ingressRules: k8s.V1NetworkPolicyIngressRule[] = [];

      // Allow from same namespace
      ingressRules.push({
        from: [
          {
            namespaceSelector: {
              matchLabels: {
                name: namespace,
              },
            },
          },
        ],
        ports: [{ protocol: 'TCP', port: 27017 }],
      });

      // Add rules for each CIDR
      for (const cidr of params.allowedCidrs) {
        ingressRules.push({
          from: [
            {
              ipBlock: {
                cidr: cidr,
              },
            },
          ],
          ports: [{ protocol: 'TCP', port: 27017 }],
        });
      }

      const networkPolicy: k8s.V1NetworkPolicy = {
        metadata: {
          name: policyName,
          namespace,
          labels: {
            'eutlas.eu/managed-by': 'eutlas',
            'eutlas.eu/cluster': resourceName,
          },
        },
        spec: {
          podSelector: {
            matchLabels: {
              app: resourceName,
            },
          },
          policyTypes: ['Ingress'],
          ingress: ingressRules,
        },
      };

      await this.networkApi.replaceNamespacedNetworkPolicy(policyName, namespace, networkPolicy);
      this.logger.log(`Network policy updated with ${params.allowedCidrs.length} CIDR rules`);
    } catch (error: any) {
      this.logger.error(`Failed to update network policy: ${error.message}`);
      throw error;
    }
  }

  // ========== Status & Health ==========

  async getClusterStatus(clusterId: string, projectId: string): Promise<ClusterStatus> {
    const namespace = this.getNamespace(projectId);
    const resourceName = this.getResourceName(clusterId);

    this.logger.debug(`Getting cluster status: namespace=${namespace}, resource=${resourceName}`);

    if (this.shouldSimulate()) {
      return {
        phase: 'Running',
        ready: true,
        replicas: 1,
        readyReplicas: 1,
      };
    }

    // Helper to extract HTTP status code from K8s client errors (handles different error formats)
    const getErrorStatusCode = (error: any): number | undefined => {
      return error.response?.statusCode || error.statusCode || error.body?.code;
    };

    // Try MongoDBCommunity CR first (MEDIUM+ plans using the operator)
    try {
      const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      ) as { body: any };

      const status = mongoDb.status || {};

      return {
        phase: status.phase || 'Unknown',
        ready: status.phase === 'Running',
        replicas: mongoDb.spec?.members || 0,
        readyReplicas: status.currentStatefulSetReplicas || 0,
        message: status.message,
      };
    } catch (error: any) {
      const code = getErrorStatusCode(error);
      if (code !== 404) {
        this.logger.warn(`MongoDBCommunity CR lookup failed (code=${code}): ${error.message || error}`);
      }
      // Fall through to StatefulSet check for DEV/SMALL plans or if CRD doesn't exist
    }

    // Fallback: Check StatefulSet directly (DEV/SMALL plans)
    try {
      const { body: statefulSet } = await this.appsApi.readNamespacedStatefulSet(resourceName, namespace);
      const specReplicas = statefulSet.spec?.replicas || 0;
      const readyReplicas = statefulSet.status?.readyReplicas || 0;
      const isReady = specReplicas > 0 && readyReplicas >= specReplicas;

      return {
        phase: isReady ? 'Running' : (readyReplicas > 0 ? 'Pending' : 'Creating'),
        ready: isReady,
        replicas: specReplicas,
        readyReplicas,
        message: isReady ? 'All pods are ready' : `${readyReplicas}/${specReplicas} pods ready`,
      };
    } catch (error: any) {
      const code = getErrorStatusCode(error);
      this.logger.warn(`StatefulSet lookup failed (code=${code}): ${error.message || error}`);

      return {
        phase: code === 404 ? 'NotFound' : 'Unknown',
        ready: false,
        replicas: 0,
        readyReplicas: 0,
        message: code === 404 
          ? 'No K8s resources found for this cluster' 
          : `Unable to query K8s status: ${error.message || 'unknown error'}`,
      };
    }
  }

  // ========== Backup & Restore ==========

  /**
   * Ensure a PVC exists for storing backups for a given cluster.
   * Called during cluster creation and before backup operations.
   */
  async ensureBackupPvc(namespace: string, resourceName: string): Promise<void> {
    const pvcName = `${resourceName}-backups`;
    try {
      await this.coreApi.readNamespacedPersistentVolumeClaim(pvcName, namespace);
      // PVC already exists
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        await this.coreApi.createNamespacedPersistentVolumeClaim(namespace, {
          metadata: {
            name: pvcName,
            namespace,
            labels: {
              'eutlas.eu/managed-by': 'eutlas',
              'eutlas.eu/cluster': resourceName,
            },
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'local-path',
            resources: { requests: { storage: '5Gi' } },
          },
        });
        this.logger.log(`Created backup PVC ${pvcName} in ${namespace}`);
      } else {
        throw error;
      }
    }
  }

  async createBackup(params: BackupParams): Promise<void> {
    this.logger.log(`Creating backup ${params.backupId} for cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(3000);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const serviceName = this.getServiceName(resourceName, params.plan);

    // Ensure the backup PVC exists
    await this.ensureBackupPvc(namespace, resourceName);

    // Build mongodump command with proper auth
    const dumpCmd = `mongodump --host="${serviceName}" --port=27017 --username="$MONGO_ADMIN_USER" --password="$MONGO_ADMIN_PASSWORD" --authenticationDatabase=admin --archive=/backup/${params.backupId}.gz --gzip`;

    const jobName = `backup-${params.backupId}`.substring(0, 63).toLowerCase();
    
    const backupJob: k8s.V1Job = {
      metadata: {
        name: jobName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/backup-id': params.backupId,
          'eutlas.eu/cluster': resourceName,
        },
      },
      spec: {
        backoffLimit: 2,
        ttlSecondsAfterFinished: 3600,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'mongodump',
                image: 'mongo:7.0',
                command: ['/bin/bash', '-c'],
                args: [dumpCmd],
                env: [
                  {
                    name: 'MONGO_ADMIN_USER',
                    value: 'admin',
                  },
                  {
                    name: 'MONGO_ADMIN_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: `${resourceName}-admin-password`,
                        key: 'password',
                      },
                    },
                  },
                ],
                volumeMounts: [
                  { name: 'backup-storage', mountPath: '/backup' },
                ],
              },
            ],
            volumes: [
              {
                name: 'backup-storage',
                persistentVolumeClaim: {
                  claimName: `${resourceName}-backups`,
                },
              },
            ],
          },
        },
      },
    };

    const batchApi = this.kc.makeApiClient(k8s.BatchV1Api);
    await batchApi.createNamespacedJob(namespace, backupJob);
    
    this.logger.log(`Backup job ${jobName} created`);
  }

  async restoreBackup(params: BackupParams & { databases?: string[]; collections?: string[] }): Promise<void> {
    this.logger.log(`Restoring backup ${params.backupId} to cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(4000);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const serviceName = this.getServiceName(resourceName, params.plan);

    // Build mongorestore command with proper auth and correct service name
    let restoreCmd = `mongorestore --host="${serviceName}" --port=27017 --username="$MONGO_ADMIN_USER" --password="$MONGO_ADMIN_PASSWORD" --authenticationDatabase=admin --archive=/backup/${params.backupId}.gz --gzip --drop`;

    if (params.databases?.length) {
      for (const db of params.databases) {
        restoreCmd += ` --nsInclude="${db}.*"`;
      }
    }

    if (params.collections?.length) {
      for (const ns of params.collections) {
        restoreCmd += ` --nsInclude="${ns}"`;
      }
    }

    const jobName = `restore-${params.backupId}`.substring(0, 63).toLowerCase();
    
    const restoreJob: k8s.V1Job = {
      metadata: {
        name: jobName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/backup-id': params.backupId,
          'eutlas.eu/cluster': resourceName,
        },
      },
      spec: {
        backoffLimit: 2,
        ttlSecondsAfterFinished: 3600,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'mongorestore',
                image: 'mongo:7.0',
                command: ['/bin/bash', '-c'],
                args: [restoreCmd],
                env: [
                  {
                    name: 'MONGO_ADMIN_USER',
                    value: 'admin',
                  },
                  {
                    name: 'MONGO_ADMIN_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: `${resourceName}-admin-password`,
                        key: 'password',
                      },
                    },
                  },
                ],
                volumeMounts: [
                  { name: 'backup-storage', mountPath: '/backup' },
                ],
              },
            ],
            volumes: [
              {
                name: 'backup-storage',
                persistentVolumeClaim: {
                  claimName: `${resourceName}-backups`,
                },
              },
            ],
          },
        },
      },
    };

    const batchApi = this.kc.makeApiClient(k8s.BatchV1Api);
    await batchApi.createNamespacedJob(namespace, restoreJob);
    
    this.logger.log(`Restore job ${jobName} created (databases: ${params.databases?.join(', ') || 'all'})`);
  }

  // ========== Qdrant Companion Service ==========

  private async createQdrantStatefulSet(
    namespace: string,
    resourceName: string,
    resources: typeof QDRANT_RESOURCES.DEV,
  ): Promise<{ host: string; port: number }> {
    // Create Qdrant StatefulSet
    const statefulSet: k8s.V1StatefulSet = {
      metadata: {
        name: resourceName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/component': 'qdrant',
          app: resourceName,
        },
      },
      spec: {
        serviceName: resourceName,
        replicas: 1,
        selector: {
          matchLabels: { app: resourceName },
        },
        template: {
          metadata: {
            labels: {
              app: resourceName,
              'eutlas.eu/component': 'qdrant',
            },
          },
          spec: {
            containers: [
              {
                name: 'qdrant',
                image: 'qdrant/qdrant:v1.13.2',
                ports: [
                  { containerPort: 6333, name: 'http' },
                  { containerPort: 6334, name: 'grpc' },
                ],
                resources: {
                  requests: { cpu: resources.cpu, memory: resources.memory },
                  limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
                },
                volumeMounts: [{ name: 'qdrant-storage', mountPath: '/qdrant/storage' }],
                readinessProbe: {
                  httpGet: { path: '/readyz', port: 6333 as any },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
                livenessProbe: {
                  httpGet: { path: '/livez', port: 6333 as any },
                  initialDelaySeconds: 10,
                  periodSeconds: 30,
                },
              },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            metadata: { name: 'qdrant-storage' },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'local-path',
              resources: { requests: { storage: resources.storage } },
            },
          },
        ],
      },
    };

    // Create headless Service for Qdrant
    const service: k8s.V1Service = {
      metadata: {
        name: resourceName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/component': 'qdrant',
          app: resourceName,
        },
      },
      spec: {
        selector: { app: resourceName },
        ports: [
          { port: 6333, targetPort: 6333, name: 'http' },
          { port: 6334, targetPort: 6334, name: 'grpc' },
        ],
        clusterIP: 'None',
      },
    };

    try {
      await this.appsApi.createNamespacedStatefulSet(namespace, statefulSet);
      this.logger.log(`Created Qdrant StatefulSet ${resourceName} in ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) {
        this.logger.error(`Failed to create Qdrant StatefulSet: ${JSON.stringify(error.response?.body || error.message)}`);
        throw error;
      }
    }

    try {
      await this.coreApi.createNamespacedService(namespace, service);
      this.logger.log(`Created Qdrant Service ${resourceName} in ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) {
        this.logger.error(`Failed to create Qdrant Service: ${JSON.stringify(error.response?.body || error.message)}`);
        throw error;
      }
    }

    return {
      host: `${resourceName}.${namespace}.svc.cluster.local`,
      port: 6333,
    };
  }

  async deleteQdrantInstance(namespace: string, clusterId: string): Promise<void> {
    const qdrantName = `qdrant-${clusterId}`.toLowerCase();

    if (this.shouldSimulate()) {
      this.logger.debug(`[SIM] Would delete Qdrant instance: ${qdrantName}`);
      return;
    }

    // Delete Qdrant StatefulSet
    try {
      await this.appsApi.deleteNamespacedStatefulSet(qdrantName, namespace);
      this.logger.log(`Deleted Qdrant StatefulSet ${qdrantName}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) {
        this.logger.warn(`Failed to delete Qdrant StatefulSet: ${error.message}`);
      }
    }

    // Delete Qdrant Service
    try {
      await this.coreApi.deleteNamespacedService(qdrantName, namespace);
      this.logger.log(`Deleted Qdrant Service ${qdrantName}`);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) {
        this.logger.warn(`Failed to delete Qdrant Service: ${error.message}`);
      }
    }

    // Delete Qdrant PVCs
    try {
      const pvcs = await this.coreApi.listNamespacedPersistentVolumeClaim(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${qdrantName}`,
      );
      for (const pvc of pvcs.body.items) {
        if (pvc.metadata?.name) {
          await this.coreApi.deleteNamespacedPersistentVolumeClaim(pvc.metadata.name, namespace);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to clean up Qdrant PVCs: ${error.message}`);
    }
  }

  // ========== Helper Methods ==========

  /**
   * Returns true if the plan uses the MongoDB Community Operator (MongoDBCommunity CRD).
   * DEV and SMALL use simple StatefulSets; everything else uses the operator.
   */
  private isOperatorManaged(plan: string): boolean {
    return ['MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'].includes(plan);
  }

  /**
   * Returns the correct MongoDB service hostname for the given deployment type.
   * Operator-managed clusters use `{resourceName}-svc`, StatefulSet clusters use `{resourceName}`.
   */
  private getServiceName(resourceName: string, plan: string): string {
    return this.isOperatorManaged(plan) ? `${resourceName}-svc` : resourceName;
  }

  private getNamespace(projectId: string): string {
    return `${this.namespacePrefix}${projectId}`.toLowerCase();
  }

  private getResourceName(clusterId: string): string {
    return `mongo-${clusterId}`.toLowerCase();
  }

  private shouldSimulate(): boolean {
    return this.devMode || !this.isConnected;
  }

  private async simulateDelay(ms: number): Promise<void> {
    this.logger.debug(`[SIM] Simulating operation (${ms}ms)`);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getSimulatedConnectionInfo(resourceName: string, namespace: string): ClusterConnectionInfo {
    return {
      host: `${resourceName}-svc.${namespace}.svc.cluster.local`,
      port: 27017,
      replicaSet: resourceName,
      srv: `${resourceName}-svc.${namespace}.svc.cluster.local`,
      externalHost: '203.0.113.1', // Simulated external IP
      externalPort: 30017, // Simulated NodePort
    };
  }

  // ========== Metrics Collection ==========

  async getClusterMetrics(clusterId: string, projectId: string): Promise<{
    cpu: number;
    memory: number;
    storage: number;
    connections: number;
  }> {
    if (this.shouldSimulate()) {
      return {
        cpu: Math.random() * 50 + 10,
        memory: Math.random() * 60 + 20,
        storage: Math.random() * 40 + 10,
        connections: Math.floor(Math.random() * 50) + 5,
      };
    }

    // In production, query Prometheus/metrics-server
    const namespace = this.getNamespace(projectId);
    const resourceName = this.getResourceName(clusterId);

    try {
      // Get pod metrics
      const metricsApi = new k8s.Metrics(this.kc);
      const pods = await metricsApi.getPodMetrics(namespace);
      
      let totalCpu = 0;
      let totalMemory = 0;

      for (const pod of pods.items) {
        if (pod.metadata?.name?.startsWith(resourceName)) {
          for (const container of pod.containers || []) {
            const cpuStr = container.usage?.cpu || '0';
            const memStr = container.usage?.memory || '0';
            
            // Parse CPU (could be in nanoCores or millicores)
            if (cpuStr.endsWith('n')) {
              totalCpu += parseInt(cpuStr) / 1000000000;
            } else if (cpuStr.endsWith('m')) {
              totalCpu += parseInt(cpuStr) / 1000;
            }

            // Parse Memory (could be in Ki, Mi, Gi)
            if (memStr.endsWith('Ki')) {
              totalMemory += parseInt(memStr) / 1024;
            } else if (memStr.endsWith('Mi')) {
              totalMemory += parseInt(memStr);
            } else if (memStr.endsWith('Gi')) {
              totalMemory += parseInt(memStr) * 1024;
            }
          }
        }
      }

      return {
        cpu: totalCpu * 100, // Convert to percentage of 1 core
        memory: totalMemory,
        storage: 0, // Would need to query PVC usage
        connections: 0, // Would need to query MongoDB directly
      };
    } catch (error: any) {
      this.logger.warn(`Failed to get metrics: ${error.message}`);
      return {
        cpu: 0,
        memory: 0,
        storage: 0,
        connections: 0,
      };
    }
  }
}
