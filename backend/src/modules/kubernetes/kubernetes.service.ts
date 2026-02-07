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
}

interface ResumeClusterParams {
  clusterId: string;
  projectId: string;
  plan: string;
}

interface ClusterConnectionInfo {
  host: string;
  port: number;
  replicaSet?: string;
  srv?: string;
}

interface CreateDatabaseUserParams {
  clusterId: string;
  projectId: string;
  username: string;
  password: string;
  roles: { role: string; db: string }[];
}

interface UpdateDatabaseUserParams {
  clusterId: string;
  projectId: string;
  username: string;
  password?: string;
  roles?: { role: string; db: string }[];
  isActive?: boolean;
}

interface DeleteDatabaseUserParams {
  clusterId: string;
  projectId: string;
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
  // Reduced resource requests to fit on shared cluster
  DEV: { cpu: '50m', memory: '128Mi', storage: '1Gi', replicas: 1, cpuLimit: '200m', memoryLimit: '256Mi' },
  SMALL: { cpu: '100m', memory: '256Mi', storage: '5Gi', replicas: 1, cpuLimit: '500m', memoryLimit: '512Mi' },
  MEDIUM: { cpu: '150m', memory: '512Mi', storage: '10Gi', replicas: 1, cpuLimit: '750m', memoryLimit: '1Gi' },
  LARGE: { cpu: '250m', memory: '1Gi', storage: '25Gi', replicas: 3, cpuLimit: '1000m', memoryLimit: '2Gi' },
  XLARGE: { cpu: '500m', memory: '2Gi', storage: '50Gi', replicas: 3, cpuLimit: '2000m', memoryLimit: '4Gi' },
  DEDICATED_SMALL: { cpu: '1000m', memory: '2Gi', storage: '50Gi', replicas: 3, cpuLimit: '2000m', memoryLimit: '4Gi' },
  DEDICATED_MEDIUM: { cpu: '2000m', memory: '4Gi', storage: '100Gi', replicas: 3, cpuLimit: '4000m', memoryLimit: '8Gi' },
  DEDICATED_LARGE: { cpu: '4000m', memory: '8Gi', storage: '250Gi', replicas: 3, cpuLimit: '8000m', memoryLimit: '16Gi' },
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
      if (!this.devMode) {
        throw error;
      }
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
      return this.getSimulatedConnectionInfo(resourceName, namespace);
    }

    try {
      // 1. Create Secret for MongoDB admin credentials
      await this.createCredentialsSecret(namespace, resourceName, params.credentials);

      // 2. Choose deployment strategy based on plan
      const useOperator = ['MEDIUM', 'LARGE', 'XLARGE', 'DEDICATED_SMALL', 'DEDICATED_MEDIUM', 'DEDICATED_LARGE'].includes(params.plan);
      
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

      this.logger.log(`MongoDB cluster ${params.clusterId} creation initiated successfully`);

      const serviceName = useOperator ? `${resourceName}-svc` : resourceName;
      return {
        host: `${serviceName}.${namespace}.svc.cluster.local`,
        port: 27017,
        replicaSet: useOperator ? resourceName : undefined,
        srv: useOperator ? `mongodb+srv://${serviceName}.${namespace}.svc.cluster.local` : undefined,
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
                  storageClassName: 'local-path', // Local path storage (or hcloud-volumes for Hetzner)
                  resources: {
                    requests: {
                      storage: params.resources.storage,
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

  async resizeMongoCluster(params: ResizeClusterParams): Promise<void> {
    this.logger.log(`Resizing cluster ${params.clusterId} to ${params.newPlan}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const resources = PLAN_RESOURCES[params.newPlan] || PLAN_RESOURCES.DEV;

    if (this.shouldSimulate()) {
      await this.simulateDelay(1500);
      return;
    }

    try {
      // Get current MongoDBCommunity resource
      const { body: current } = await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      ) as { body: any };

      // Update resource configuration
      current.metadata.labels['eutlas.eu/plan'] = params.newPlan;
      current.spec.members = resources.replicas;
      current.spec.statefulSet.spec.template.spec.containers[0].resources = {
        requests: {
          cpu: resources.cpu,
          memory: resources.memory,
        },
        limits: {
          cpu: resources.cpuLimit,
          memory: resources.memoryLimit,
        },
      };

      await this.customApi.replaceNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
        current,
      );

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
      // Scale down the StatefulSet to 0 replicas using scale subresource
      const statefulSetName = `${resourceName}`;
      
      // Read current scale
      const currentScale = await this.appsApi.readNamespacedStatefulSetScale(statefulSetName, namespace);
      
      // Update replicas to 0
      if (currentScale.body.spec) {
        currentScale.body.spec.replicas = 0;
      }
      
      await this.appsApi.replaceNamespacedStatefulSetScale(statefulSetName, namespace, currentScale.body);

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
      // Scale up the StatefulSet to original replicas using scale subresource
      const statefulSetName = `${resourceName}`;
      
      // Read current scale
      const currentScale = await this.appsApi.readNamespacedStatefulSetScale(statefulSetName, namespace);
      
      // Update replicas
      if (currentScale.body.spec) {
        currentScale.body.spec.replicas = resources.replicas;
      }
      
      await this.appsApi.replaceNamespacedStatefulSetScale(statefulSetName, namespace, currentScale.body);

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
      // Create password secret for the user
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
        stringData: {
          password: params.password,
        },
      });

      // Update MongoDBCommunity resource to add the user
      const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      ) as { body: any };

      const newUser = {
        name: params.username,
        db: 'admin',
        passwordSecretRef: {
          name: secretName,
        },
        roles: params.roles.map(r => ({ name: r.role, db: r.db })),
        scramCredentialsSecretName: `${resourceName}-${params.username}-scram`,
      };

      mongoDb.spec.users = mongoDb.spec.users || [];
      mongoDb.spec.users.push(newUser);

      await this.customApi.replaceNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
        mongoDb,
      );

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
      // Update password secret if provided
      if (params.password) {
        const secretName = `${resourceName}-user-${params.username}`;
        
        // Read current secret and update it
        const currentSecret = await this.coreApi.readNamespacedSecret(secretName, namespace);
        if (currentSecret.body.stringData) {
          currentSecret.body.stringData.password = params.password;
        } else {
          currentSecret.body.stringData = { password: params.password };
        }
        
        await this.coreApi.replaceNamespacedSecret(secretName, namespace, currentSecret.body);
      }

      // Update roles if provided
      if (params.roles) {
        const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
          'mongodbcommunity.mongodb.com',
          'v1',
          namespace,
          'mongodbcommunity',
          resourceName,
        ) as { body: any };

        const userIndex = mongoDb.spec.users.findIndex((u: any) => u.name === params.username);
        if (userIndex !== -1) {
          mongoDb.spec.users[userIndex].roles = params.roles.map(r => ({ name: r.role, db: r.db }));

          await this.customApi.replaceNamespacedCustomObject(
            'mongodbcommunity.mongodb.com',
            'v1',
            namespace,
            'mongodbcommunity',
            resourceName,
            mongoDb,
          );
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
      // Delete user's password secret
      const secretName = `${resourceName}-user-${params.username}`;
      await this.coreApi.deleteNamespacedSecret(secretName, namespace);

      // Remove user from MongoDBCommunity resource
      const { body: mongoDb } = await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      ) as { body: any };

      mongoDb.spec.users = mongoDb.spec.users.filter((u: any) => u.name !== params.username);

      await this.customApi.replaceNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
        mongoDb,
      );

      this.logger.log(`Database user ${params.username} deleted`);
    } catch (error: any) {
      this.logger.error(`Failed to delete database user: ${error.message}`);
      throw error;
    }
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

    if (this.shouldSimulate()) {
      return {
        phase: 'Running',
        ready: true,
        replicas: 1,
        readyReplicas: 1,
      };
    }

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
      if (error.response?.statusCode !== 404) {
        throw error;
      }
      // No MongoDBCommunity CR found — fall through to StatefulSet check (DEV/SMALL plans)
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
      if (error.response?.statusCode === 404) {
        return {
          phase: 'NotFound',
          ready: false,
          replicas: 0,
          readyReplicas: 0,
          message: 'No K8s resources found for this cluster',
        };
      }
      throw error;
    }
  }

  // ========== Backup & Restore ==========

  async createBackup(params: BackupParams): Promise<void> {
    this.logger.log(`Creating backup ${params.backupId} for cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(3000);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    // Create a Job to run mongodump
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
                args: [
                  `mongodump --uri="mongodb://${resourceName}-svc:27017" --archive=/backup/${params.backupId}.gz --gzip`,
                ],
                env: [
                  {
                    name: 'MONGO_ADMIN_USER',
                    valueFrom: {
                      secretKeyRef: {
                        name: `${resourceName}-admin-password`,
                        key: 'username',
                      },
                    },
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
                  {
                    name: 'backup-storage',
                    mountPath: '/backup',
                  },
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

  async restoreBackup(params: BackupParams): Promise<void> {
    this.logger.log(`Restoring backup ${params.backupId} to cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(4000);
      return;
    }

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    // Create a Job to run mongorestore
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
                args: [
                  `mongorestore --uri="mongodb://${resourceName}-svc:27017" --archive=/backup/${params.backupId}.gz --gzip --drop`,
                ],
                volumeMounts: [
                  {
                    name: 'backup-storage',
                    mountPath: '/backup',
                  },
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
    
    this.logger.log(`Restore job ${jobName} created`);
  }

  // ========== Helper Methods ==========

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
      srv: `mongodb+srv://${resourceName}-svc.${namespace}.svc.cluster.local`,
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
