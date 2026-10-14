import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as k8s from '@kubernetes/client-node';
import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';

// ========== Interfaces ==========

export type VectorSearchBackend = 'mongodb-search' | 'qdrant';

interface CreateClusterParams {
  clusterId: string;
  projectId: string;
  orgId: string;
  clusterName: string;
  plan: string;
  mongoVersion: string;
  region?: string;
  vectorSearchEnabled?: boolean;
  /** When vector search is enabled: native MongoDB Search (MEDIUM+) or legacy Qdrant companion. */
  vectorSearchBackend?: VectorSearchBackend;
  credentials: {
    username: string;
    password: string;
  };
  /** Raw kubeconfig YAML for the cluster's dedicated Hetzner node. */
  dedicatedKubeconfig?: string;
  /**
   * Additional external IPv4 CIDRs that should be permitted to connect to this
   * cluster's MongoDB on port 27017 at creation time. Useful during a relocation
   * migration so the source cluster's node IP can reach the new cluster before
   * the customer's own whitelist is restored.
   */
  additionalIngressIps?: string[];
  /** multi-site: 2 data members (fsn1 + nbg1) and 1 arbiter (fsn1) on separate nodes. */
  topology?: 'single-server' | 'multi-site';
}

interface ResizeClusterParams {
  clusterId: string;
  projectId: string;
  newPlan: string;
}

interface DeleteClusterParams {
  clusterId: string;
  projectId: string;
  /** Raw kubeconfig YAML for the cluster's dedicated Hetzner node. */
  dedicatedKubeconfig?: string;
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

interface CompanionResources {
  cpu: string;
  memory: string;
  cpuLimit: string;
  memoryLimit: string;
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

// Data-bearing volumes use LUKS-encrypted Hetzner Cloud Volumes (encryption at
// rest, AES-256, managed by the hcloud CSI driver) instead of the unencrypted
// node-local `local-path` storage — required for the platform's ISO 27001 goals.
const ENCRYPTED_STORAGE_CLASS = 'hcloud-volumes-encrypted';
// Dedicated K3s nodes have no hcloud CSI driver (it would need the project-wide
// Hetzner token on customer servers). Their local-path storage lives on a
// LUKS-encrypted Hetzner volume set up by HetznerProvisionerService instead.
const DEDICATED_STORAGE_CLASS = 'local-path';

// Off-site object storage for tenant backups. The image is pinned: the previous
// `minio/mc:latest` was withdrawn from every public registry, which silently
// stopped all off-site uploads from 2026-09-11 while archives kept piling up on
// node-local PVCs until the nodes hit DiskPressure.
const RCLONE_IMAGE = 'rclone/rclone:1.75.1';
const OBJECT_STORAGE_SECRET = 'platform-backup-object-storage';

// Hetzner endpoints are https://<location>.your-objectstorage.com; the location
// doubles as the S3 signing region.
const OFFSITE_REGION_EXPORT = String.raw`export RCLONE_CONFIG_OFFSITE_REGION="$(echo "$RCLONE_CONFIG_OFFSITE_ENDPOINT" | sed -E 's#^https?://([^.]+)\..*#\1#')"`;

const BACKUP_ID_PATTERN = /^[a-f0-9]{24}$/;

interface BackupParams {
  clusterId: string;
  projectId: string;
  plan: string;
  backupId: string;
  storageClass?: string;
  // For a cluster living on its own dedicated server (no pods in this cluster):
  // the reachable external endpoint and control-plane admin password, so the
  // in-cluster backup Job can dump the live instance directly.
  backupHost?: string;
  backupPort?: number;
  adminPassword?: string;
  // The cluster lives on its own dedicated node: always use the external
  // endpoint, even if stale pods of a pre-migration copy still run here.
  dedicated?: boolean;
}

export interface BackupRunResult {
  sizeBytes: number;
  compressedSizeBytes: number;
  storagePath: string;
  metadata?: {
    databases?: string[];
    collections?: number;
    documents?: number;
    indexes?: number;
  };
  simulated: boolean;
}

export interface ClusterTlsTopology {
  replicaSet: string;
  members: Array<{ index: number; podName: string; host: string; port: number; horizon: string; arbiter: boolean }>;
}

export interface PlatformDiagnostics {
  nodes: Array<{
    name: string;
    ready: boolean;
    diskPressure: boolean;
    memoryPressure: boolean;
    pidPressure: boolean;
    taints: string[];
    memoryAllocatableGb: number;
    memoryRequestedPercent: number | null;
  }>;
  unhealthyPods: Array<{ namespace: string; count: number; reasons: Record<string, number>; examples: string[] }>;
  longRunningJobs: Array<{ namespace: string; name: string; ageMinutes: number }>;
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

// Aggregate storage budget (sum of requests.storage across all PVCs) per plan.
// Enforced via a per-namespace ResourceQuota so a single cluster cannot request
// unbounded PVCs and so the dedicated node's disk is protected.
// Values account for data × replicas + 1 Gi logs/replica + 5 Gi backups + Qdrant + headroom.
export const PLAN_NAMESPACE_STORAGE_QUOTA: Record<string, string> = {
  DEV:          '15Gi',
  SMALL:        '25Gi',
  MEDIUM:       '40Gi',
  LARGE:        '120Gi',
  XLARGE:       '220Gi',
  XXL:          '400Gi',
  XXXL:         '900Gi',
  DEDICATED_L:  '1Ti',
  DEDICATED_XL: '2Ti',
};

// Maximum PVC request that a single PersistentVolumeClaim may declare in the
// namespace. Prevents a user/operator from asking for a multi-TB volume on a
// small-plan node.
export const PLAN_MAX_PVC_SIZE: Record<string, string> = {
  DEV:          '5Gi',
  SMALL:        '10Gi',
  MEDIUM:       '20Gi',
  LARGE:        '50Gi',
  XLARGE:       '100Gi',
  XXL:          '200Gi',
  XXXL:         '500Gi',
  DEDICATED_L:  '500Gi',
  DEDICATED_XL: '1Ti',
};

// Native MongoDB Search companion resource sizing (opt-in, only when vectorSearchEnabled).
// This deploys mongot via MongoDBSearch, enabling $vectorSearch on MongoDB Community 8.2+.
export const MONGODB_SEARCH_RESOURCES: Record<string, CompanionResources> = {
  DEV: { cpu: '100m', memory: '256Mi', cpuLimit: '200m', memoryLimit: '512Mi' },
  SMALL: { cpu: '200m', memory: '512Mi', cpuLimit: '500m', memoryLimit: '1Gi' },
  MEDIUM: { cpu: '250m', memory: '512Mi', cpuLimit: '750m', memoryLimit: '1Gi' },
  LARGE: { cpu: '500m', memory: '1Gi', cpuLimit: '1000m', memoryLimit: '2Gi' },
  XLARGE: { cpu: '1000m', memory: '2Gi', cpuLimit: '2000m', memoryLimit: '4Gi' },
  XXL: { cpu: '1000m', memory: '4Gi', cpuLimit: '2000m', memoryLimit: '8Gi' },
  XXXL: { cpu: '2000m', memory: '8Gi', cpuLimit: '4000m', memoryLimit: '16Gi' },
  DEDICATED_L: { cpu: '4000m', memory: '16Gi', cpuLimit: '8000m', memoryLimit: '32Gi' },
  DEDICATED_XL: { cpu: '8000m', memory: '32Gi', cpuLimit: '16000m', memoryLimit: '64Gi' },
};

// Legacy Qdrant companion sizing (DEV/SMALL clusters and existing Qdrant-backed clusters).
export const QDRANT_RESOURCES: Record<string, CompanionResources & { storage: string }> = {
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

/** Resolve which vector-search companion to provision for a cluster operation. */
export function resolveVectorSearchBackend(options: {
  vectorSearchEnabled?: boolean;
  vectorSearchBackend?: VectorSearchBackend;
  vectorDbHost?: string;
  plan: string;
}): VectorSearchBackend | undefined {
  if (!options.vectorSearchEnabled) {
    return undefined;
  }
  if (options.vectorSearchBackend) {
    return options.vectorSearchBackend;
  }
  // Existing Qdrant-backed clusters must keep Qdrant on reprovision/relocation.
  if (options.vectorDbHost) {
    return 'qdrant';
  }
  return isOperatorManagedPlan(options.plan) ? 'mongodb-search' : 'qdrant';
}

function isOperatorManagedPlan(plan: string): boolean {
  return ['MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'].includes(plan);
}

// MongoDB Community Operator CRD API Version
const MONGODB_API_VERSION = 'mongodbcommunity.mongodb.com/v1';
const MONGODB_KIND = 'MongoDBCommunity';
const MONGODB_SEARCH_API_GROUP = 'mongodb.com';
const MONGODB_SEARCH_API_VERSION = 'v1';
const MONGODB_SEARCH_PLURAL = 'mongodbsearch';
const MONGODB_SEARCH_KIND = 'MongoDBSearch';
const DEFAULT_MONGO_VERSION = '7.0.5';
const NATIVE_VECTOR_SEARCH_MIN_VERSION = '8.2.0';

/** Parse a Kubernetes memory string ("512Mi", "1Gi", "1000m", …) to GB (decimal). */
function parseMemoryToGB(mem: string): number {
  const m = mem.trim().match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|K|M|G|T)?$/);
  if (!m) return 1;
  const n = parseFloat(m[1]);
  const unit = m[2] || '';
  const factorMi: Record<string, number> = {
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1024 * 1024,
    K: 1 / 1024,
    M: 1,
    G: 1024,
    T: 1024 * 1024,
    '': 1 / (1024 * 1024), // raw bytes
  };
  const mib = n * (factorMi[unit] ?? 1);
  return mib / 1024; // GB (GiB)
}

interface K8sClients {
  kc: k8s.KubeConfig;
  coreApi: k8s.CoreV1Api;
  appsApi: k8s.AppsV1Api;
  batchApi: k8s.BatchV1Api;
  networkApi: k8s.NetworkingV1Api;
  customApi: k8s.CustomObjectsApi;
  rbacApi: k8s.RbacAuthorizationV1Api;
  dataStorageClass: string;
}

function buildClients(kc: k8s.KubeConfig, dataStorageClass: string): K8sClients {
  return {
    kc,
    coreApi: kc.makeApiClient(k8s.CoreV1Api),
    appsApi: kc.makeApiClient(k8s.AppsV1Api),
    batchApi: kc.makeApiClient(k8s.BatchV1Api),
    networkApi: kc.makeApiClient(k8s.NetworkingV1Api),
    customApi: kc.makeApiClient(k8s.CustomObjectsApi),
    rbacApi: kc.makeApiClient(k8s.RbacAuthorizationV1Api),
    dataStorageClass,
  };
}

@Injectable()
export class KubernetesService implements OnModuleInit {
  private readonly logger = new Logger(KubernetesService.name);
  private readonly namespacePrefix: string;
  private readonly controlPlaneNamespace: string;
  /** Clients for the shared (control-plane) cluster. */
  private defaults: K8sClients = { dataStorageClass: ENCRYPTED_STORAGE_CLASS } as K8sClients;
  /**
   * Per-async-context clients for a cluster's dedicated node. Operations for
   * different clusters run concurrently (metrics, user changes, jobs), so the
   * target cluster must never be swapped in shared instance fields.
   */
  private readonly clusterContext = new AsyncLocalStorage<K8sClients>();
  private dedicatedKubeconfigResolver?: (clusterId: string) => Promise<string | undefined>;
  private defaultConnected = false;

  private get clients(): K8sClients {
    return this.clusterContext.getStore() ?? this.defaults;
  }
  private get kc() { return this.clients.kc; }
  private get coreApi() { return this.clients.coreApi; }
  private get appsApi() { return this.clients.appsApi; }
  private get batchApi() { return this.clients.batchApi; }
  private get networkApi() { return this.clients.networkApi; }
  private get customApi() { return this.clients.customApi; }
  private get rbacApi() { return this.clients.rbacApi; }
  /** StorageClass for data PVCs on the cluster currently being operated on. */
  private get dataStorageClass() { return this.clients.dataStorageClass; }
  private get isConnected() {
    return this.clusterContext.getStore() ? true : this.defaultConnected;
  }
  private readonly devMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.namespacePrefix = this.configService.get<string>('K8S_NAMESPACE_PREFIX', 'eutlas-');
    this.controlPlaneNamespace = this.configService.get<string>(
      'K8S_CONTROL_PLANE_NAMESPACE',
      'eutlas',
    );
    this.devMode = this.configService.get<string>('NODE_ENV') !== 'production';
  }

  async onModuleInit() {
    await this.initializeKubeClient();
  }

  private async initializeKubeClient(): Promise<void> {
    try {
      const kc = new k8s.KubeConfig();
      
      const inCluster = this.configService.get<boolean>('K8S_IN_CLUSTER', false);
      
      if (inCluster) {
        // Running inside Kubernetes
        kc.loadFromCluster();
        this.logger.log('Loaded Kubernetes config from cluster');
      } else {
        // Try to load from default location (~/.kube/config)
        try {
          kc.loadFromDefault();
          this.logger.log('Loaded Kubernetes config from default location');
        } catch (e) {
          if (!this.devMode) {
            throw e;
          }
          this.logger.warn('No Kubernetes config found - running in simulation mode');
          return;
        }
      }

      this.defaults = buildClients(kc, ENCRYPTED_STORAGE_CLASS);

      // Test connection
      if (!this.devMode) {
        await this.coreApi.listNamespace();
        this.defaultConnected = true;
        this.logger.log('Successfully connected to Kubernetes cluster');
      }
    } catch (error: any) {
      this.logger.error(`Failed to connect to Kubernetes: ${error.message}`);
      this.logger.warn('Falling back to simulation mode for Kubernetes operations');
      // Don't crash the app - fall back to simulation mode
      this.defaultConnected = false;
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
        
      } else {
        throw error;
      }
    }

    // Ensure RBAC also exists for namespaces created before newer operator requirements.
    await this.createMongoDBRBAC(namespace);

    return namespace;
  }

  private async createMongoDBRBAC(namespace: string): Promise<void> {
    try {
      const serviceAccounts = [
        'mongodb-database',
        'mongodb-kubernetes-appdb',
        'mongodb-kubernetes-database-pods',
      ];

      for (const name of serviceAccounts) {
        try {
          await this.coreApi.createNamespacedServiceAccount(namespace, {
            metadata: { name, namespace },
          });
        } catch (error: any) {
          if (error.response?.statusCode !== 409) {
            throw error;
          }
        }
      }

      // Create Role for MongoDB
      const role: k8s.V1Role = {
        metadata: { name: 'mongodb-role', namespace },
        rules: [
          {
            apiGroups: [''],
            resources: ['secrets', 'pods', 'services', 'configmaps'],
            verbs: ['get', 'list', 'watch', 'create', 'update', 'patch'],
          },
        ],
      };

      try {
        await this.rbacApi.createNamespacedRole(namespace, role);
      } catch (error: any) {
        if (error.response?.statusCode !== 409) {
          throw error;
        }
        const existing = await this.rbacApi.readNamespacedRole('mongodb-role', namespace);
        const existingResource = (existing as any).body ?? existing;
        role.metadata!.resourceVersion = existingResource.metadata?.resourceVersion;
        await this.rbacApi.replaceNamespacedRole('mongodb-role', namespace, role);
      }

      // Create RoleBinding
      const roleBinding: k8s.V1RoleBinding = {
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
          {
            kind: 'ServiceAccount',
            name: 'mongodb-kubernetes-appdb',
            namespace,
          },
          {
            kind: 'ServiceAccount',
            name: 'mongodb-kubernetes-database-pods',
            namespace,
          },
        ],
      };

      try {
        await this.rbacApi.createNamespacedRoleBinding(namespace, roleBinding);
      } catch (error: any) {
        if (error.response?.statusCode !== 409) {
          throw error;
        }
        const existing = await this.rbacApi.readNamespacedRoleBinding('mongodb-binding', namespace);
        const existingResource = (existing as any).body ?? existing;
        roleBinding.metadata!.resourceVersion = existingResource.metadata?.resourceVersion;
        await this.rbacApi.replaceNamespacedRoleBinding('mongodb-binding', namespace, roleBinding);
      }

      this.logger.log(`Created MongoDB RBAC in namespace: ${namespace}`);
    } catch (error: any) {
      this.logger.warn(`Failed to create MongoDB RBAC: ${error.message}`);
    }
  }

  /**
   * Applies / updates the namespace ResourceQuota + LimitRange for the given plan.
   * Idempotent — safe to call on every create/resize.
   *
   * Prevents PVC sprawl by capping the total `requests.storage` in the
   * namespace and the maximum size of any single PVC. Even though
   * local-path-provisioner does not enforce write limits inside a PVC, this
   * still guarantees that no customer namespace can request more total
   * storage than the dedicated node can absorb.
   */
  async applyNamespaceQuota(namespace: string, plan: string): Promise<void> {
    if (this.shouldSimulate()) {
      this.logger.debug(`[SIM] Would apply ResourceQuota for ${namespace} (plan=${plan})`);
      return;
    }

    const storageQuota = PLAN_NAMESPACE_STORAGE_QUOTA[plan] || PLAN_NAMESPACE_STORAGE_QUOTA.DEV;
    const maxPvc = PLAN_MAX_PVC_SIZE[plan] || PLAN_MAX_PVC_SIZE.DEV;
    const resources = PLAN_RESOURCES[plan] || PLAN_RESOURCES.DEV;

    // ── ResourceQuota ────────────────────────────────────────────────────
    const quotaBody: any = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: 'eutlas-plan-quota',
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/plan': plan,
        },
      },
      spec: {
        hard: {
          // Total sum of all PVC `requests.storage` in this namespace
          'requests.storage': storageQuota,
          // Hard cap on number of PVCs — prevents runaway PVC creation
          persistentvolumeclaims: String(Math.max(10, resources.replicas * 4)),
        },
      },
    };

    try {
      await this.coreApi.replaceNamespacedResourceQuota(
        'eutlas-plan-quota',
        namespace,
        quotaBody,
      );
      this.logger.log(`Updated ResourceQuota for ${namespace} (plan=${plan}, storage=${storageQuota})`);
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        await this.coreApi.createNamespacedResourceQuota(namespace, quotaBody);
        this.logger.log(`Created ResourceQuota for ${namespace} (plan=${plan}, storage=${storageQuota})`);
      } else {
        this.logger.warn(`Failed to apply ResourceQuota in ${namespace}: ${error.message}`);
      }
    }

    // ── LimitRange (per-PVC ceiling) ──────────────────────────────────────
    const limitRangeBody: any = {
      apiVersion: 'v1',
      kind: 'LimitRange',
      metadata: {
        name: 'eutlas-pvc-limits',
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/plan': plan,
        },
      },
      spec: {
        limits: [
          {
            type: 'PersistentVolumeClaim',
            max: { storage: maxPvc },
            min: { storage: '10Mi' },
          },
        ],
      },
    };

    try {
      await this.coreApi.replaceNamespacedLimitRange(
        'eutlas-pvc-limits',
        namespace,
        limitRangeBody,
      );
      this.logger.log(`Updated LimitRange for ${namespace} (max PVC=${maxPvc})`);
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        await this.coreApi.createNamespacedLimitRange(namespace, limitRangeBody);
        this.logger.log(`Created LimitRange for ${namespace} (max PVC=${maxPvc})`);
      } else {
        this.logger.warn(`Failed to apply LimitRange in ${namespace}: ${error.message}`);
      }
    }
  }

  /**
   * Returns the WiredTiger cache size (GB) for a given plan, capped so the
   * mongod container cannot exceed its memory limit.
   *
   * Rule: min(50% of memoryLimit, memoryLimit - 1 GB), floored at 0.25 GB.
   */
  private cacheSizeGBForPlan(plan: string): number {
    const resources = PLAN_RESOURCES[plan] || PLAN_RESOURCES.DEV;
    const memGB = parseMemoryToGB(resources.memoryLimit);
    const candidate = Math.min(memGB * 0.5, Math.max(memGB - 1, 0.25));
    // Round down to nearest 0.25 GB for a stable value
    const rounded = Math.max(0.25, Math.floor(candidate * 4) / 4);
    return rounded;
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
    if (params.dedicatedKubeconfig) {
      const { dedicatedKubeconfig, ...rest } = params;
      return this.withDedicatedClients(dedicatedKubeconfig, () => this.createMongoCluster(rest));
    }

    this.logger.log(`Creating MongoDB cluster ${params.clusterId} (${params.clusterName})`);

    const namespace = await this.ensureNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const resources = PLAN_RESOURCES[params.plan] || PLAN_RESOURCES.DEV;
    const useOperator = this.isOperatorManaged(params.plan);
    const vectorBackend = resolveVectorSearchBackend({
      vectorSearchEnabled: params.vectorSearchEnabled,
      vectorSearchBackend: params.vectorSearchBackend,
      plan: params.plan,
    });
    const useNativeSearch = vectorBackend === 'mongodb-search';
    const useQdrant = vectorBackend === 'qdrant';
    const mongoVersion = this.resolveMongoVersion(params.mongoVersion, useNativeSearch);

    if (useNativeSearch && !useOperator) {
      throw new Error('Native MongoDB Vector Search requires an operator-managed plan (MEDIUM or larger).');
    }

    // Apply plan-based storage quota / PVC limit range before creating PVCs.
    try {
      await this.applyNamespaceQuota(namespace, params.plan);
    } catch (err: any) {
      this.logger.warn(`Quota setup failed for ${namespace}: ${err.message}`);
    }

    if (this.shouldSimulate()) {
      await this.simulateDelay(2000);
      const simInfo = this.getSimulatedConnectionInfo(resourceName, namespace);
      if (useQdrant) {
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
      if (useNativeSearch) {
        await this.ensureSearchSyncSourceSecret(namespace, resourceName);
      }

      // 2. Choose deployment strategy based on plan
      if (useOperator) {
        // Use MongoDB Operator for larger plans (replica sets)
        this.logger.log(`Using MongoDB Operator for plan ${params.plan}`);
        await this.createMongoDBCommunityResource(namespace, resourceName, {
          ...params,
          mongoVersion,
          resources,
          nativeVectorSearch: useNativeSearch,
        });
      } else {
        // Use simple StatefulSet for DEV/SMALL plans (single node)
        this.logger.log(`Using simple StatefulSet for plan ${params.plan}`);
        await this.createSimpleMongoDBStatefulSet(namespace, resourceName, params.credentials, resources, params.plan);
      }

      // 3. Create NetworkPolicy for security
      await this.createDefaultNetworkPolicy(namespace, resourceName, params.additionalIngressIps);

      // 4. Create backup PVC for this cluster
      await this.ensureBackupPvc(namespace, resourceName);

      // 5. Create vector-search companion (legacy Qdrant or native MongoDB Search)
      let qdrantInfo: { host: string; port: number } | undefined;
      if (useQdrant) {
        const qdrantResources = QDRANT_RESOURCES[params.plan] || QDRANT_RESOURCES.DEV;
        const qdrantName = `qdrant-${params.clusterId}`.toLowerCase();
        qdrantInfo = await this.createQdrantStatefulSet(namespace, qdrantName, qdrantResources);
        this.logger.log(`Qdrant companion service created for cluster ${params.clusterId}`);
      } else if (useNativeSearch) {
        const searchResources = MONGODB_SEARCH_RESOURCES[params.plan] || MONGODB_SEARCH_RESOURCES.MEDIUM;
        await this.createMongoDBSearchResource(namespace, resourceName, params, searchResources);
        this.logger.log(`MongoDBSearch companion created for cluster ${params.clusterId}`);
      }

      // 6. Create external NodePort service for outside-cluster connectivity
      const externalServiceName = `${resourceName}-external`;
      const podAppLabel = useOperator ? `${resourceName}-svc` : resourceName;
      await this.createExternalService(namespace, externalServiceName, resourceName, podAppLabel);
      if (useOperator) {
        await this.ensurePrimaryExternalServiceSync(namespace, resourceName, externalServiceName, podAppLabel);
      }

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

  private async ensureSearchSyncSourceSecret(namespace: string, resourceName: string): Promise<void> {
    const secretName = `${resourceName}-search-sync-source-password`;

    try {
      await this.coreApi.readNamespacedSecret(secretName, namespace);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) {
        throw error;
      }

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
          password: randomBytes(32).toString('base64url'),
        },
      });
    }
  }

  // Mirror the platform off-site object-storage secret into a tenant namespace so
  // the backup job can upload archives off-site. Returns false (off-site skipped)
  // when the platform has no such secret — tenant backups then stay local-only.
  private async ensureObjectStorageSecret(namespace: string): Promise<boolean> {
    const secretName = OBJECT_STORAGE_SECRET;
    const platformNamespace = 'eutlas';

    let source: k8s.V1Secret;
    try {
      source = (
        await this.coreApi.readNamespacedSecret(secretName, platformNamespace)
      ).body;
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return false;
      }
      throw error;
    }

    try {
      await this.coreApi.readNamespacedSecret(secretName, namespace);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) {
        throw error;
      }
      await this.coreApi.createNamespacedSecret(namespace, {
        metadata: {
          name: secretName,
          namespace,
          labels: { 'eutlas.eu/managed-by': 'eutlas' },
        },
        type: source.type || 'Opaque',
        data: source.data,
      });
    }
    return true;
  }

  /** rclone env for the `offsite:` remote, read from the mirrored object-storage secret. */
  private offsiteEnv(): k8s.V1EnvVar[] {
    const fromSecret = (name: string, key: string): k8s.V1EnvVar => ({
      name,
      valueFrom: { secretKeyRef: { name: OBJECT_STORAGE_SECRET, key } },
    });
    return [
      fromSecret('S3_BUCKET', 'bucket'),
      fromSecret('RCLONE_CONFIG_OFFSITE_ENDPOINT', 'endpoint'),
      fromSecret('RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID', 'accessKey'),
      fromSecret('RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY', 'secretKey'),
      { name: 'RCLONE_CONFIG_OFFSITE_TYPE', value: 's3' },
      { name: 'RCLONE_CONFIG_OFFSITE_PROVIDER', value: 'Other' },
    ];
  }

  /** Off-site object path of a tenant backup archive (expanded by the container shell). */
  private offsiteArchivePath(resourceName: string, backupId: string): string {
    return `offsite:$S3_BUCKET/tenant-backups/${resourceName}/${backupId}.gz`;
  }

  private async createMongoDBCommunityResource(
    namespace: string,
    resourceName: string,
    params: CreateClusterParams & { resources: typeof PLAN_RESOURCES.DEV; nativeVectorSearch?: boolean },
  ): Promise<void> {
    const multiSite = params.topology === 'multi-site';
    if (multiSite) await this.pinMultiSiteVolumes(namespace, resourceName, params.resources.storage);
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
        // Multi-site: two data members + one arbiter, each pinned to its node
        // through a pre-bound volume (see pinMultiSiteVolumes); member 0 sits
        // in fsn1 next to the applications and is the preferred primary.
        ...(multiSite
          ? { members: 2, arbiters: 1, memberConfig: [{ votes: 1, priority: '2' }, { votes: 1, priority: '1' }] }
          : { members: params.resources.replicas }),
        type: 'ReplicaSet', // MongoDB Community Operator only supports ReplicaSet
        version: params.mongoVersion || DEFAULT_MONGO_VERSION,
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
          ...(params.nativeVectorSearch ? [
            {
              name: 'search-sync-source',
              db: 'admin',
              passwordSecretRef: {
                name: `${resourceName}-search-sync-source-password`,
              },
              roles: [
                { name: 'searchCoordinator', db: 'admin' },
              ],
              scramCredentialsSecretName: `${resourceName}-search-sync-source`,
            },
          ] : []),
        ],
        additionalMongodConfig: {
          'storage.wiredTiger.engineConfig.journalCompressor': 'zlib',
          // Cap WiredTiger cache so mongod stays within its memory limit.
          'storage.wiredTiger.engineConfig.cacheSizeGB': this.cacheSizeGBForPlan(params.plan),
          // zstd gives better compression ratio than snappy at similar CPU cost —
          // keeps on-disk footprint smaller.
          'storage.wiredTiger.collectionConfig.blockCompressor': 'zstd',
          'net.maxIncomingConnections': 1000,
        },
        statefulSet: {
          spec: {
            template: {
              spec: {
                // Spread replica-set members across nodes so a single node or disk
                // failure cannot take the whole cluster down. Only meaningful for
                // multi-member (HA) plans; single-member plans skip it. Uses hard
                // anti-affinity because with node-local (local-path) storage two
                // members on one node would defeat the purpose of HA entirely.
                ...(params.resources.replicas > 1
                  ? {
                      affinity: {
                        podAntiAffinity: {
                          requiredDuringSchedulingIgnoredDuringExecution: [
                            {
                              labelSelector: {
                                matchLabels: { app: `${resourceName}-svc` },
                              },
                              topologyKey: 'kubernetes.io/hostname',
                            },
                          ],
                        },
                      },
                    }
                  : {}),
                // The arbiter shares this template and runs on the tainted arbiter node.
                ...(multiSite
                  ? { tolerations: [{ key: 'eutlas.eu/arbiter', operator: 'Equal', value: 'true', effect: 'NoSchedule' }] }
                  : {}),
                initContainers: [
                  {
                    name: 'mongod-posthook',
                    resources: {
                      requests: {
                        cpu: '10m',
                        memory: '32Mi',
                      },
                      limits: {
                        cpu: '250m',
                        memory: '128Mi',
                      },
                    },
                  },
                  {
                    name: 'mongodb-agent-readinessprobe',
                    resources: {
                      requests: {
                        cpu: '10m',
                        memory: '32Mi',
                      },
                      limits: {
                        cpu: '250m',
                        memory: '128Mi',
                      },
                    },
                  },
                ],
                containers: [
                  {
                    name: 'mongod',
                    resources: {
                      // Multi-site nodes each run exactly one mongod, so requests only
                      // gate scheduling — and the arbiter (same template, small
                      // node) must fit. Limits stay at the plan size.
                      requests: multiSite
                        ? { cpu: '100m', memory: '256Mi' }
                        : { cpu: params.resources.cpu, memory: params.resources.memory },
                      limits: {
                        cpu: params.resources.cpuLimit,
                        memory: params.resources.memoryLimit,
                      },
                    },
                  },
                  {
                    name: 'mongodb-agent',
                    resources: {
                      // The operator defaults this sidecar to 500m/400M requests,
                      // which can block customer DB recovery on tight nodes after a restart.
                      requests: {
                        cpu: '25m',
                        memory: '64Mi',
                      },
                      limits: {
                        cpu: '500m',
                        memory: '500M',
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
                  storageClassName: this.dataStorageClass,
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
                  storageClassName: this.dataStorageClass,
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
      const existing = await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com',
        'v1',
        namespace,
        'mongodbcommunity',
        resourceName,
      );
      const existingResource = (existing as any).body ?? existing;
      (mongoDBSpec.metadata as any).resourceVersion = existingResource.metadata?.resourceVersion;
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

  private async createMongoDBSearchResource(
    namespace: string,
    resourceName: string,
    params: CreateClusterParams,
    resources: CompanionResources,
  ): Promise<void> {
    const mongoDBSearchSpec = {
      apiVersion: `${MONGODB_SEARCH_API_GROUP}/${MONGODB_SEARCH_API_VERSION}`,
      kind: MONGODB_SEARCH_KIND,
      metadata: {
        name: resourceName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster-id': params.clusterId,
          'eutlas.eu/org-id': params.orgId,
          'eutlas.eu/project-id': params.projectId,
          'eutlas.eu/component': 'mongodb-search',
        },
        annotations: {
          'eutlas.eu/cluster-name': params.clusterName,
          'eutlas.eu/created-at': new Date().toISOString(),
          'eutlas.eu/preview-feature': 'mongodb-community-vector-search',
        },
      },
      spec: {
        resourceRequirements: {
          requests: {
            cpu: resources.cpu,
            memory: resources.memory,
          },
          limits: {
            cpu: resources.cpuLimit,
            memory: resources.memoryLimit,
          },
        },
      },
    };

    try {
      const existing = await this.customApi.getNamespacedCustomObject(
        MONGODB_SEARCH_API_GROUP,
        MONGODB_SEARCH_API_VERSION,
        namespace,
        MONGODB_SEARCH_PLURAL,
        resourceName,
      );
      const existingResource = (existing as any).body ?? existing;
      (mongoDBSearchSpec.metadata as any).resourceVersion = existingResource.metadata?.resourceVersion;
      await this.customApi.replaceNamespacedCustomObject(
        MONGODB_SEARCH_API_GROUP,
        MONGODB_SEARCH_API_VERSION,
        namespace,
        MONGODB_SEARCH_PLURAL,
        resourceName,
        mongoDBSearchSpec,
      );
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        try {
          await this.customApi.createNamespacedCustomObject(
            MONGODB_SEARCH_API_GROUP,
            MONGODB_SEARCH_API_VERSION,
            namespace,
            MONGODB_SEARCH_PLURAL,
            mongoDBSearchSpec,
          );
          this.logger.log(`Created MongoDBSearch resource ${resourceName} in ${namespace}`);
        } catch (createError: any) {
          this.logger.error(`Failed to create MongoDBSearch: status=${createError.response?.statusCode}, body=${JSON.stringify(createError.response?.body || createError.body || createError.message)}`);
          throw createError;
        }
      } else {
        this.logger.error(`Failed to check MongoDBSearch: status=${error.response?.statusCode}, body=${JSON.stringify(error.response?.body || error.body || error.message)}`);
        throw error;
      }
    }
  }

  private async createSimpleMongoDBStatefulSet(
    namespace: string,
    resourceName: string,
    credentials: { username: string; password: string },
    resources: typeof PLAN_RESOURCES.DEV,
    plan: string = 'DEV',
  ): Promise<void> {
    // Create a simple StatefulSet for DEV/SMALL plans (single node, no operator)
    const secretName = `${resourceName}-admin-password`;
    const cacheGB = this.cacheSizeGBForPlan(plan);

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
                args: [
                  '--bind_ip_all',
                  '--wiredTigerCacheSizeGB', String(cacheGB),
                  '--wiredTigerCollectionBlockCompressor', 'zstd',
                  '--wiredTigerJournalCompressor', 'zlib',
                ],
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
              storageClassName: this.dataStorageClass,
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
   *
   * `externalTrafficPolicy: Local` preserves the original client source IP — this
   * is required so the per-cluster NetworkPolicy IP whitelist (e.g. the customer's
   * office IP) can actually match incoming connections. With the default `Cluster`
   * policy, kube-proxy SNATs external traffic to an in-cluster IP, which bypasses
   * any real client-IP whitelist.
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
        externalTrafficPolicy: 'Local',
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
   * Keeps the public NodePort service for an operator-managed replica set pinned
   * to the writable primary. This preserves the existing directConnection=true
   * customer URI contract while avoiding random routing to secondaries after
   * elections.
   */
  private async ensurePrimaryExternalServiceSync(
    namespace: string,
    resourceName: string,
    externalServiceName: string,
    podAppLabel: string,
  ): Promise<void> {
    const serviceAccountName = `${resourceName}-primary-sync`;
    const roleName = `${resourceName}-primary-sync`;
    const cronJobName = `${resourceName}-primary-sync`;

    try {
      await this.coreApi.createNamespacedServiceAccount(namespace, {
        metadata: {
          name: serviceAccountName,
          namespace,
          labels: {
            'eutlas.eu/managed-by': 'eutlas',
            'eutlas.eu/cluster': resourceName,
          },
        },
      });
    } catch (error: any) {
      if (error.response?.statusCode !== 409) {
        throw error;
      }
    }

    const role: k8s.V1Role = {
      metadata: {
        name: roleName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster': resourceName,
        },
      },
      rules: [
        { apiGroups: [''], resources: ['secrets'], verbs: ['get'] },
        { apiGroups: [''], resources: ['services'], verbs: ['get', 'patch'] },
        { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
        { apiGroups: [''], resources: ['pods/exec'], verbs: ['create'] },
      ],
    };

    try {
      await this.rbacApi.createNamespacedRole(namespace, role);
    } catch (error: any) {
      if (error.response?.statusCode === 409) {
        await this.rbacApi.replaceNamespacedRole(roleName, namespace, role);
      } else {
        throw error;
      }
    }

    const roleBinding: k8s.V1RoleBinding = {
      metadata: {
        name: roleName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster': resourceName,
        },
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: roleName,
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: serviceAccountName,
          namespace,
        },
      ],
    };

    try {
      await this.rbacApi.createNamespacedRoleBinding(namespace, roleBinding);
    } catch (error: any) {
      if (error.response?.statusCode === 409) {
        await this.rbacApi.replaceNamespacedRoleBinding(roleName, namespace, roleBinding);
      } else {
        throw error;
      }
    }

    const syncScript = [
      'set -eu',
      `NS="${namespace}"`,
      `CID="${resourceName}"`,
      `SVC="${externalServiceName}"`,
      `APP_LABEL="${podAppLabel}"`,
      'PW="$(kubectl get secret -n "$NS" "$CID-admin-password" -o jsonpath="{.data.password}" | base64 -d)"',
      // TLS first (required once a cluster's TLS mode is "required"; the
      // certificate is not issued for 127.0.0.1, so skip validation for this
      // in-pod loopback check), plaintext for clusters without TLS.
      'Q="const p=db.hello().primary || \'\'; print(p.split(\'.\')[0]);"',
      'PRIMARY="$( { kubectl exec -n "$NS" "$CID-0" -c mongod -- mongosh --quiet --tls --tlsAllowInvalidCertificates --host 127.0.0.1 --port 27017 -u admin -p "$PW" --authenticationDatabase admin --eval "$Q" 2>/dev/null || kubectl exec -n "$NS" "$CID-0" -c mongod -- mongosh --quiet --host 127.0.0.1 --port 27017 -u admin -p "$PW" --authenticationDatabase admin --eval "$Q" 2>/dev/null; } | awk \'/^mongo-/ { print; exit }\')"',
      'if [ -z "$PRIMARY" ]; then',
      '  echo "Could not determine MongoDB primary" >&2',
      '  exit 1',
      'fi',
      'CURRENT="$(kubectl get svc -n "$NS" "$SVC" -o jsonpath="{.spec.selector.statefulset\\.kubernetes\\.io/pod-name}" 2>/dev/null || true)"',
      'if [ "$CURRENT" = "$PRIMARY" ]; then',
      '  echo "$SVC already points to $PRIMARY"',
      '  exit 0',
      'fi',
      'PATCH="$(printf \'{"spec":{"selector":{"app":"%s","statefulset.kubernetes.io/pod-name":"%s"}}}\' "$APP_LABEL" "$PRIMARY")"',
      'kubectl patch svc -n "$NS" "$SVC" --type merge -p "$PATCH"',
      'echo "Patched $SVC selector from ${CURRENT:-<none>} to $PRIMARY"',
    ].join('\n');

    const cronJob: k8s.V1CronJob = {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: {
        name: cronJobName,
        namespace,
        labels: {
          'eutlas.eu/managed-by': 'eutlas',
          'eutlas.eu/cluster': resourceName,
        },
      },
      spec: {
        schedule: '* * * * *',
        concurrencyPolicy: 'Forbid',
        successfulJobsHistoryLimit: 1,
        failedJobsHistoryLimit: 3,
        jobTemplate: {
          spec: {
            backoffLimit: 1,
            template: {
              metadata: {
                labels: {
                  'eutlas.eu/managed-by': 'eutlas',
                  'eutlas.eu/cluster': resourceName,
                  app: cronJobName,
                },
              },
              spec: {
                serviceAccountName,
                restartPolicy: 'Never',
                containers: [
                  {
                    name: 'primary-sync',
                    image: 'rancher/mirrored-library-busybox:1.37.0',
                    imagePullPolicy: 'IfNotPresent',
                    volumeMounts: [
                      {
                        name: 'kubectl',
                        mountPath: '/usr/local/bin/kubectl',
                        readOnly: true,
                      },
                    ],
                    command: ['/bin/sh', '-ec', syncScript],
                  },
                ],
                volumes: [
                  {
                    name: 'kubectl',
                    hostPath: {
                      path: '/usr/local/bin/k3s',
                      type: 'File',
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };

    try {
      await this.batchApi.createNamespacedCronJob(namespace, cronJob);
      this.logger.log(`Created MongoDB primary sync CronJob ${cronJobName} in ${namespace}`);
    } catch (error: any) {
      if (error.response?.statusCode === 409) {
        await this.batchApi.replaceNamespacedCronJob(cronJobName, namespace, cronJob);
        this.logger.log(`Updated MongoDB primary sync CronJob ${cronJobName} in ${namespace}`);
      } else {
        this.logger.error(`Failed to create primary sync CronJob: ${JSON.stringify(error.response?.body || error.message)}`);
        throw error;
      }
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
    return this.onClusterNode(clusterId, () => this.enableExternalAccessOnNode(clusterId, projectId, plan));
  }

  private async enableExternalAccessOnNode(
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

  private async createDefaultNetworkPolicy(
    namespace: string,
    resourceName: string,
    additionalIngressIps?: string[],
  ): Promise<void> {
    const policyName = `${resourceName}-network-policy`;
    // Closed by default (like Atlas): only the platform and explicitly passed
    // CIDRs until the customer adds IP access-list entries. This used to be
    // 0.0.0.0/0, and later access-list changes never reached dedicated nodes.
    const externalIngressCidrs = [...this.platformEgressCidrs, ...(additionalIngressIps ?? [])];

    const ingressRules: k8s.V1NetworkPolicyIngressRule[] = [
      {
        // Allow from same tenant namespace and control plane namespace.
        from: [
          {
            namespaceSelector: {
              matchLabels: {
                'kubernetes.io/metadata.name': namespace,
              },
            },
          },
          {
            namespaceSelector: {
              matchLabels: {
                'kubernetes.io/metadata.name': this.controlPlaneNamespace,
              },
            },
          },
        ],
        ports: [
          { protocol: 'TCP', port: 27017 },
        ],
      },
    ];

    for (const cidr of externalIngressCidrs) {
      ingressRules.push({
        from: [{ ipBlock: { cidr } }],
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
        podSelector: this.mongoPodSelector(resourceName),
        policyTypes: ['Ingress'],
        ingress: ingressRules,
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
    return this.onClusterNode(params.clusterId, () => this.resizeMongoClusterOnNode(params));
  }

  private async resizeMongoClusterOnNode(params: ResizeClusterParams & { currentPlan?: string }): Promise<void> {
    this.logger.log(`Resizing cluster ${params.clusterId} to ${params.newPlan}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const resources = PLAN_RESOURCES[params.newPlan] || PLAN_RESOURCES.DEV;

    if (this.shouldSimulate()) {
      await this.simulateDelay(1500);
      return;
    }

    // Update storage quota / PVC limits for the new plan before expanding.
    try {
      await this.applyNamespaceQuota(namespace, params.newPlan);
    } catch (err: any) {
      this.logger.warn(`Quota update failed for ${namespace}: ${err.message}`);
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
    if (params.dedicatedKubeconfig) {
      const { dedicatedKubeconfig, ...rest } = params;
      return this.withDedicatedClients(dedicatedKubeconfig, () => this.deleteMongoCluster(rest));
    }

    this.logger.log(`Deleting cluster ${params.clusterId}`);

    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);

    if (this.shouldSimulate()) {
      await this.simulateDelay(1000);
      return;
    }

    try {
      // Delete MongoDBSearch resource if native vector search was enabled
      try {
        await this.customApi.deleteNamespacedCustomObject(
          MONGODB_SEARCH_API_GROUP,
          MONGODB_SEARCH_API_VERSION,
          namespace,
          MONGODB_SEARCH_PLURAL,
          resourceName,
        );
      } catch (e: any) {
        if (e.response?.statusCode !== 404) {
          this.logger.warn(`Failed to delete MongoDBSearch ${resourceName}: ${e.message}`);
        }
      }

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
    return this.onClusterNode(params.clusterId, () => this.pauseMongoClusterOnNode(params));
  }

  private async pauseMongoClusterOnNode(params: PauseClusterParams): Promise<void> {
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
    return this.onClusterNode(params.clusterId, () => this.resumeMongoClusterOnNode(params));
  }

  private async resumeMongoClusterOnNode(params: ResumeClusterParams): Promise<void> {
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
    return this.onClusterNode(params.clusterId, () => this.createDatabaseUserOnNode(params));
  }

  private async createDatabaseUserOnNode(params: CreateDatabaseUserParams): Promise<void> {
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
    return this.onClusterNode(params.clusterId, () => this.updateDatabaseUserOnNode(params));
  }

  private async updateDatabaseUserOnNode(params: UpdateDatabaseUserParams): Promise<void> {
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
    return this.onClusterNode(params.clusterId, () => this.deleteDatabaseUserOnNode(params));
  }

  private async deleteDatabaseUserOnNode(params: DeleteDatabaseUserParams): Promise<void> {
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
  private async execInPod(
    namespace: string,
    podName: string,
    containerName: string,
    command: string,
  ): Promise<string> {
    const exec = new k8s.Exec(this.kc);

    return new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      exec.exec(
        namespace,
        podName,
        containerName,
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

  private async execInMongoPod(namespace: string, resourceName: string, command: string): Promise<string> {
    const podName = `${resourceName}-0`;
    return this.execInPod(namespace, podName, 'mongodb', command);
  }

  // ========== Network Policy Management ==========

  async updateNetworkPolicy(params: UpdateNetworkPolicyParams): Promise<void> {
    return this.onClusterNode(params.clusterId, () => this.updateNetworkPolicyOnNode(params));
  }

  private async updateNetworkPolicyOnNode(params: UpdateNetworkPolicyParams): Promise<void> {
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
                'kubernetes.io/metadata.name': namespace,
              },
            },
          },
          {
            namespaceSelector: {
              matchLabels: {
                'kubernetes.io/metadata.name': this.controlPlaneNamespace,
              },
            },
          },
        ],
        ports: [{ protocol: 'TCP', port: 27017 }],
      });

      // Add rules for each CIDR (the platform's own egress IPs always stay
      // allowed so backups, metrics and migrations keep working).
      const cidrs = [...new Set([...this.platformEgressCidrs, ...params.allowedCidrs])];
      for (const cidr of cidrs) {
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
          podSelector: this.mongoPodSelector(resourceName),
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
    return this.onClusterNode(clusterId, () => this.getClusterStatusOnNode(clusterId, projectId));
  }

  private async getClusterStatusOnNode(clusterId: string, projectId: string): Promise<ClusterStatus> {
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
            storageClassName: this.dataStorageClass,
            resources: { requests: { storage: '5Gi' } },
          },
        });
        this.logger.log(`Created backup PVC ${pvcName} in ${namespace}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Materialise a cluster's admin password as a local secret so a backup Job's
   * secretKeyRef resolves — used for clusters whose own admin secret lives on a
   * dedicated server rather than in this namespace.
   */
  private async ensureAdminSecretValue(
    namespace: string,
    secretName: string,
    resourceName: string,
    password: string,
  ): Promise<void> {
    try {
      await this.coreApi.readNamespacedSecret(secretName, namespace);
      return; // already present
    } catch (error: any) {
      if (error.response?.statusCode !== 404) throw error;
    }
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
      stringData: { password },
    });
  }

  /**
   * Where a backup/restore Job in the shared cluster reaches the cluster's
   * MongoDB. If the in-cluster service has backing pods, the live replica set
   * runs here → use the service. Otherwise the cluster lives on its own
   * dedicated server → use that server's reachable external endpoint,
   * materialising the control-plane admin password as a local secret so the
   * Job's secretKeyRef resolves. If neither is possible, fail fast (a missing
   * secret would otherwise sit in CreateContainerConfigError, piling up
   * against the node pod limit).
   */
  private async resolveMongoTarget(
    namespace: string,
    resourceName: string,
    serviceName: string,
    params: BackupParams,
  ): Promise<{ host: string; port: number; inCluster: boolean }> {
    let hasLocalPods = false;
    try {
      const ep = await this.coreApi.readNamespacedEndpoints(serviceName, namespace);
      hasLocalPods = (ep.body.subsets || []).some((s) => (s.addresses || []).length > 0);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) throw error;
    }
    if (hasLocalPods && !params.dedicated) {
      return { host: serviceName, port: 27017, inCluster: true };
    }

    if (!params.backupHost || !params.backupPort || !params.adminPassword) {
      throw new Error(
        `Cluster ${resourceName} has no in-cluster pods and no reachable dedicated ` +
          `endpoint/credentials in ${namespace}; cannot reach its MongoDB`,
      );
    }
    await this.ensureAdminSecretValue(namespace, `${resourceName}-admin-password`, resourceName, params.adminPassword);
    return { host: params.backupHost, port: params.backupPort, inCluster: false };
  }

  async createBackup(params: BackupParams): Promise<void> {
    this.logger.log(`Creating backup ${params.backupId} for cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(3000);
      return;
    }

    // The backup Job always runs in the shared cluster. Clusters created on a
    // dedicated node have no tenant namespace here yet, so create it first.
    const namespace = await this.ensureNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const serviceName = this.getServiceName(resourceName, params.plan);

    // Ensure the backup PVC exists
    await this.ensureBackupPvc(namespace, resourceName);

    const { host: dumpHost, port: dumpPort, inCluster: hasLocalPods } = await this.resolveMongoTarget(
      namespace,
      resourceName,
      serviceName,
      params,
    );

    // Build mongodump command with proper auth and verify the compressed archive before the Job succeeds.
    const archivePath = `/backup/${params.backupId}.gz`;
    // When dumping the in-cluster replica set via its service, read from a
    // secondary and serialise collections: dumping the primary in parallel is what
    // intermittently failed large backups with CursorNotFound ("Mux ending but
    // selectCases still open") when the primary churned mid-dump. The dedicated
    // direct-connection path is already stable and keeps mongodump's defaults.
    const dumpFlags = hasLocalPods
      ? ' --readPreference=secondaryPreferred --numParallelCollections=1'
      : '';
    const dumpCmd = [
      'set -euo pipefail',
      `mongodump --host="${dumpHost}" --port=${dumpPort} --username="$MONGO_ADMIN_USER" --password="$MONGO_ADMIN_PASSWORD" --authenticationDatabase=admin${dumpFlags} --archive=${archivePath} --gzip`,
      `test -s ${archivePath}`,
      `gzip -t ${archivePath}`,
      `stat -c '%s' ${archivePath}`,
    ].join(' && ');

    const jobName = `backup-${params.backupId}`.substring(0, 63).toLowerCase();

    // Copy the off-site storage secret into the tenant namespace. If the platform
    // has none, off-site is skipped and the backup stays local-only.
    const offsiteEnabled = await this.ensureObjectStorageSecret(namespace);

    const mongodumpContainer = {
      name: 'mongodump',
      image: 'mongo:7.0',
      command: ['/bin/bash', '-c'],
      args: [dumpCmd],
      env: [
        { name: 'MONGO_ADMIN_USER', value: 'admin' },
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
      volumeMounts: [{ name: 'backup-storage', mountPath: '/backup' }],
      // A memory request lifts the pod out of BestEffort QoS so it is not the
      // first thing evicted / OOM-killed under node memory pressure (the likely
      // cause of intermittent backup failures). The limit is generous so a large
      // dump never hits it.
      resources: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '1000m', memory: '1Gi' },
      },
    };

    // Off-site is the authoritative copy: the archive only stages on the PVC and
    // is removed once the upload is verified, so node-local storage holds at most
    // one in-flight dump. A failed upload fails the backup (and drops the staged
    // archive) instead of leaving an unnoticed local-only copy behind.
    const uploadCmd = [
      'set -u',
      `ARCHIVE=${archivePath}`,
      `DEST="${this.offsiteArchivePath(resourceName, params.backupId)}"`,
      'if [ ! -s "$ARCHIVE" ]; then echo "no archive to upload"; exit 1; fi',
      OFFSITE_REGION_EXPORT,
      'if rclone copyto "$ARCHIVE" "$DEST"; then',
      '  LOCAL_SIZE=$(stat -c %s "$ARCHIVE")',
      '  REMOTE_SIZE=$(rclone lsf --format s "$DEST" 2>/dev/null)',
      '  if [ -n "$REMOTE_SIZE" ] && [ "$LOCAL_SIZE" = "$REMOTE_SIZE" ]; then',
      '    rm -f "$ARCHIVE"; echo "offsite upload ok ($REMOTE_SIZE bytes); staged archive removed"; exit 0',
      '  fi',
      '  echo "offsite size mismatch (local=$LOCAL_SIZE remote=$REMOTE_SIZE)"',
      'else',
      '  echo "offsite upload FAILED"',
      'fi',
      'rm -f "$ARCHIVE"',
      'exit 1',
    ].join('\n');

    const uploadContainer = {
      name: 'offsite-upload',
      image: RCLONE_IMAGE,
      command: ['/bin/sh', '-c'],
      args: [uploadCmd],
      env: this.offsiteEnv(),
      volumeMounts: [{ name: 'backup-storage', mountPath: '/backup' }],
      resources: {
        requests: { cpu: '50m', memory: '64Mi' },
        limits: { cpu: '250m', memory: '256Mi' },
      },
    };

    // With off-site enabled, mongodump runs as an init container so the upload
    // container runs strictly after it; the archive-size read still targets the
    // 'mongodump' container logs either way.
    const podSpec: any = offsiteEnabled
      ? { restartPolicy: 'Never', initContainers: [mongodumpContainer], containers: [uploadContainer] }
      : { restartPolicy: 'Never', containers: [mongodumpContainer] };

    podSpec.volumes = [
      {
        name: 'backup-storage',
        persistentVolumeClaim: { claimName: `${resourceName}-backups` },
      },
    ];

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
        // Matches waitForJobCompletion's timeout; without it a Job whose image
        // cannot be pulled sits in ImagePullBackOff forever.
        activeDeadlineSeconds: 3600,
        ttlSecondsAfterFinished: 3600,
        template: { spec: podSpec },
      },
    };

    const batchApi = this.kc.makeApiClient(k8s.BatchV1Api);
    await batchApi.createNamespacedJob(namespace, backupJob);

    this.logger.log(
      `Backup job ${jobName} created${offsiteEnabled ? ' (with off-site upload)' : ''}`,
    );
  }

  async restoreBackup(params: BackupParams & { databases?: string[]; collections?: string[] }): Promise<void> {
    this.logger.log(`Restoring backup ${params.backupId} to cluster ${params.clusterId}`);

    if (this.shouldSimulate()) {
      await this.simulateDelay(4000);
      return;
    }

    const namespace = await this.ensureNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const serviceName = this.getServiceName(resourceName, params.plan);
    await this.ensureBackupPvc(namespace, resourceName);
    // Dedicated clusters are restored through their external endpoint, like backups.
    const target = await this.resolveMongoTarget(namespace, resourceName, serviceName, params);

    // Build mongorestore command with proper auth and correct service name
    let restoreCmd = `mongorestore --host="${target.host}" --port=${target.port} --username="$MONGO_ADMIN_USER" --password="$MONGO_ADMIN_PASSWORD" --authenticationDatabase=admin --archive=/backup/${params.backupId}.gz --gzip --drop`;

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

    // Archives only stage locally until their off-site upload is verified, so a
    // restore normally fetches the archive from object storage first. A fetched
    // copy is dropped again afterwards so it does not linger on the PVC.
    const archivePath = `/backup/${params.backupId}.gz`;
    const fetchedMarker = `${archivePath}.fetched`;
    const offsiteEnabled = await this.ensureObjectStorageSecret(namespace);
    const fetchContainers = offsiteEnabled
      ? [
          {
            name: 'fetch-archive',
            image: RCLONE_IMAGE,
            command: ['/bin/sh', '-c'],
            args: [
              [
                'set -eu',
                `if [ -s ${archivePath} ]; then echo "using staged archive"; exit 0; fi`,
                OFFSITE_REGION_EXPORT,
                `rclone copyto "${this.offsiteArchivePath(resourceName, params.backupId)}" ${archivePath}`,
                `test -s ${archivePath}`,
                `touch ${fetchedMarker}`,
              ].join('\n'),
            ],
            env: this.offsiteEnv(),
            volumeMounts: [{ name: 'backup-storage', mountPath: '/backup' }],
            resources: {
              requests: { cpu: '50m', memory: '64Mi' },
              limits: { cpu: '500m', memory: '256Mi' },
            },
          },
        ]
      : [];
    restoreCmd = `${restoreCmd}; rc=$?; if [ -f ${fetchedMarker} ]; then rm -f ${archivePath} ${fetchedMarker}; fi; exit $rc`;

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
            initContainers: fetchContainers,
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

  /**
   * Remove backup archives (staged local copy and off-site object) for expired or
   * deleted backups, and wait for the purge Job to finish. Missing objects are
   * not an error, so a purge can safely be retried.
   */
  async purgeBackupArchives(params: {
    clusterId: string;
    projectId: string;
    backupIds: string[];
  }): Promise<void> {
    const backupIds = params.backupIds.filter((id) => BACKUP_ID_PATTERN.test(id));
    if (backupIds.length === 0 || this.shouldSimulate()) {
      return;
    }

    const resourceName = this.getResourceName(params.clusterId);
    const pvcName = `${resourceName}-backups`;

    // Backups of a deleted cluster/project outlive its tenant namespace; their
    // off-site objects are then removed from the platform namespace instead.
    let namespace = this.getNamespace(params.projectId);
    let hasPvc = true;
    try {
      await this.coreApi.readNamespace(namespace);
      await this.coreApi.readNamespacedPersistentVolumeClaim(pvcName, namespace);
    } catch (error: any) {
      if (error.response?.statusCode !== 404) throw error;
      hasPvc = false;
    }
    if (!hasPvc) {
      try {
        await this.coreApi.readNamespace(namespace);
      } catch (error: any) {
        if (error.response?.statusCode !== 404) throw error;
        namespace = this.controlPlaneNamespace;
      }
    }
    const offsiteEnabled = await this.ensureObjectStorageSecret(namespace);
    if (!hasPvc && !offsiteEnabled) {
      return;
    }

    const lines = ['set -u', 'failed=0'];
    if (offsiteEnabled) lines.push(OFFSITE_REGION_EXPORT);
    for (const id of backupIds) {
      if (hasPvc) lines.push(`rm -f /backup/${id}.gz /backup/${id}.gz.fetched`);
      if (offsiteEnabled) {
        const object = this.offsiteArchivePath(resourceName, id);
        // deletefile fails on an already-missing object; only a still-present one is an error.
        lines.push(
          `rclone deletefile "${object}" 2>/dev/null || ! rclone lsf "${object}" 2>/dev/null | grep -q . || failed=1`,
        );
      }
    }
    lines.push(`echo "purged ${backupIds.length} archive(s), failed=$failed"`, 'exit $failed');

    const jobName = `purge-${resourceName}-${Date.now().toString(36)}`.substring(0, 63).toLowerCase();
    const job: k8s.V1Job = {
      metadata: {
        name: jobName,
        namespace,
        labels: { 'eutlas.eu/managed-by': 'eutlas', 'eutlas.eu/cluster': resourceName },
      },
      spec: {
        backoffLimit: 2,
        ttlSecondsAfterFinished: 3600,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'purge',
                image: RCLONE_IMAGE,
                command: ['/bin/sh', '-c'],
                args: [lines.join('\n')],
                env: offsiteEnabled ? this.offsiteEnv() : [],
                volumeMounts: hasPvc ? [{ name: 'backup-storage', mountPath: '/backup' }] : [],
                resources: {
                  requests: { cpu: '20m', memory: '32Mi' },
                  limits: { cpu: '250m', memory: '128Mi' },
                },
              },
            ],
            volumes: hasPvc
              ? [{ name: 'backup-storage', persistentVolumeClaim: { claimName: pvcName } }]
              : [],
          },
        },
      },
    };

    await this.batchApi.createNamespacedJob(namespace, job);
    await this.waitForJobCompletion(namespace, jobName, 30 * 60 * 1000);
    this.logger.log(`Purged ${backupIds.length} backup archive(s) of ${resourceName}`);
  }

  getBackupJobName(backupId: string): string {
    return `backup-${backupId}`.substring(0, 63).toLowerCase();
  }

  getRestoreJobName(backupId: string): string {
    return `restore-${backupId}`.substring(0, 63).toLowerCase();
  }

  isKubernetesConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Create a backup and wait for the K8s Job to finish. Returns real archive size in production.
   */
  async runBackup(params: BackupParams): Promise<BackupRunResult> {
    const storagePath = `/backup/${params.backupId}.gz`;

    if (this.shouldSimulate()) {
      await this.simulateDelay(3000);
      const sizeBytes = 10 * 1024 * 1024;
      return {
        sizeBytes,
        compressedSizeBytes: sizeBytes,
        storagePath: `/backups/${params.clusterId}/${params.backupId}.archive`,
        metadata: {
          databases: ['admin'],
          collections: 1,
          documents: 100,
          indexes: 1,
        },
        simulated: true,
      };
    }

    await this.createBackup(params);
    const namespace = this.getNamespace(params.projectId);
    const jobName = this.getBackupJobName(params.backupId);

    await this.waitForJobCompletion(namespace, jobName);
    const sizeBytes = await this.getBackupArchiveSize(namespace, jobName, params.backupId);

    if (sizeBytes <= 0) {
      throw new Error(`Backup archive missing or empty for ${params.backupId}`);
    }

    return {
      sizeBytes,
      compressedSizeBytes: sizeBytes,
      storagePath,
      simulated: false,
    };
  }

  /**
   * Restore from backup and wait for the K8s Job to finish.
   */
  async runRestore(
    params: BackupParams & { databases?: string[]; collections?: string[] },
  ): Promise<void> {
    if (this.shouldSimulate()) {
      await this.simulateDelay(4000);
      return;
    }

    await this.restoreBackup(params);
    const namespace = this.getNamespace(params.projectId);
    const jobName = this.getRestoreJobName(params.backupId);
    await this.waitForJobCompletion(namespace, jobName);
  }

  private async waitForJobCompletion(
    namespace: string,
    jobName: string,
    timeoutMs = 60 * 60 * 1000,
    pollIntervalMs = 5000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await this.batchApi.readNamespacedJob(jobName, namespace);
      const status = response.body.status;

      if (status?.succeeded && status.succeeded >= 1) {
        return;
      }

      if (status?.failed && status.failed >= 1) {
        const reason = await this.getJobFailureReason(namespace, jobName);
        throw new Error(`Job ${jobName} failed: ${reason}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Job ${jobName} timed out after ${timeoutMs}ms`);
  }

  private async getJobPodName(namespace: string, jobName: string): Promise<string | null> {
    const response = await this.coreApi.listNamespacedPod(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `job-name=${jobName}`,
    );

    const pods = response.body.items;
    const succeeded = pods.find((pod) => pod.status?.phase === 'Succeeded');
    return succeeded?.metadata?.name || pods[0]?.metadata?.name || null;
  }

  private async getJobFailureReason(namespace: string, jobName: string): Promise<string> {
    try {
      const podName = await this.getJobPodName(namespace, jobName);
      if (!podName) {
        return 'no pod found for job';
      }

      const podResponse = await this.coreApi.readNamespacedPod(podName, namespace);
      const statuses = [
        ...(podResponse.body.status?.initContainerStatuses || []),
        ...(podResponse.body.status?.containerStatuses || []),
      ];
      // Report the container that actually failed (e.g. the off-site upload),
      // not just the first one.
      const containerStatus =
        statuses.find((s) => (s.state?.terminated?.exitCode ?? 0) !== 0) || statuses[0];
      const terminated = containerStatus?.state?.terminated;
      if (terminated?.message) {
        return terminated.message;
      }

      const containerName = containerStatus?.name || 'mongodump';
      const logs = await this.coreApi.readNamespacedPodLog(podName, namespace, containerName);
      const tail = logs.body.split('\n').slice(-10).join('\n').trim();
      return tail ? `${containerName}: ${tail}` : terminated?.reason || 'unknown error';
    } catch (error: any) {
      return error.message || 'unknown error';
    }
  }

  private async getBackupArchiveSize(
    namespace: string,
    jobName: string,
    backupId: string,
  ): Promise<number> {
    const podName = await this.getJobPodName(namespace, jobName);
    if (!podName) {
      throw new Error(`No pod found for backup job ${jobName}`);
    }

    // The backup job prints the archive size (its final `stat -c '%s'` step) as the
    // last line of stdout. Read it from the pod logs rather than exec-ing into the
    // container: waitForJobCompletion has already returned by this point, so the
    // mongodump container has terminated and can no longer be exec'd — which made
    // this always return 0 and marked every successful backup as failed.
    const logs = await this.coreApi.readNamespacedPodLog(podName, namespace, 'mongodump');
    const sizeLine = logs.body
      .split('\n')
      .map((line) => line.trim())
      .reverse()
      .find((line) => /^\d+$/.test(line));

    return sizeLine ? Number.parseInt(sizeLine, 10) || 0 : 0;
  }

  // ========== Qdrant Companion Service ==========

  private async createQdrantStatefulSet(
    namespace: string,
    resourceName: string,
    resources: CompanionResources & { storage: string },
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
              storageClassName: this.dataStorageClass,
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

  // ========== Dedicated-server client swapping ==========

  /**
   * Temporarily replaces the shared K8s API clients with ones built from `kubeconfigYaml`,
   * runs `fn`, then restores the original clients.
   *
   * This is safe because the job processor processes one job at a time (isProcessing guard).
   */
  private async withDedicatedClients<T>(kubeconfigYaml: string, fn: () => Promise<T>): Promise<T> {
    const kc = new k8s.KubeConfig();
    kc.loadFromString(kubeconfigYaml);
    return this.clusterContext.run(buildClients(kc, DEDICATED_STORAGE_CLASS), fn);
  }

  /**
   * Registered by ClustersService: resolves a cluster's dedicated-node kubeconfig
   * (undefined for clusters living in the shared cluster).
   */
  setDedicatedKubeconfigResolver(resolver: (clusterId: string) => Promise<string | undefined>): void {
    this.dedicatedKubeconfigResolver = resolver;
  }

  /** Runs fn against the cluster's own node when it has one, else the shared cluster. */
  private async onClusterNode<T>(clusterId: string, fn: () => Promise<T>): Promise<T> {
    if (this.clusterContext.getStore() || !this.dedicatedKubeconfigResolver || this.shouldSimulate()) {
      return fn();
    }
    const kubeconfig = await this.dedicatedKubeconfigResolver(clusterId);
    return kubeconfig ? this.withDedicatedClients(kubeconfig, fn) : fn();
  }

  /**
   * Multi-site placement: pre-create the StatefulSets' volume claims and bind
   * each to its node (selected-node annotation, honoured by local-path with
   * WaitForFirstConsumer). The StatefulSets adopt claims by name, and a pod
   * can only run where its volume lives: member 0 on the fsn1 data node,
   * member 1 on the nbg1 data node, the arbiter on the arbiter node. This
   * keeps the arbiter in the initial spec — adding it later deadlocks the
   * operator (its reconfig includes an arbiter pod that does not exist yet).
   */
  private async pinMultiSiteVolumes(namespace: string, resourceName: string, storage: string): Promise<void> {
    const nodeFor = async (selector: string): Promise<string> => {
      const { body } = await this.coreApi.listNode(undefined, undefined, undefined, undefined, selector);
      if (body.items.length !== 1) throw new Error(`Expected exactly one node for ${selector}, found ${body.items.length}`);
      return body.items[0].metadata!.name!;
    };
    const placement: Array<[string, string]> = [
      [`${resourceName}-0`, await nodeFor('eutlas.eu/role=data,topology.kubernetes.io/zone=fsn1')],
      [`${resourceName}-1`, await nodeFor('eutlas.eu/role=data,topology.kubernetes.io/zone=nbg1')],
      [`${resourceName}-arb-0`, await nodeFor('eutlas.eu/role=arbiter')],
    ];
    for (const [pod, node] of placement) {
      for (const [volume, size] of [['data-volume', storage], ['logs-volume', '1Gi']]) {
        try {
          await this.coreApi.createNamespacedPersistentVolumeClaim(namespace, {
            metadata: {
              name: `${volume}-${pod}`,
              namespace,
              labels: { app: `${resourceName}-svc` },
              annotations: { 'volume.kubernetes.io/selected-node': node },
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: this.dataStorageClass,
              resources: { requests: { storage: size } },
            },
          });
        } catch (error: any) {
          if (error.response?.statusCode !== 409) throw error;
        }
      }
    }
    this.logger.log(`Multi-site ${resourceName}: volumes pinned ${placement.map(([p, n]) => `${p}→${n}`).join(', ')}`);
  }

  /**
   * Waits until a multi-site replica set is Running with both data members and
   * the arbiter, and verifies that the data members ended up in two locations.
   * TLS must only be enabled afterwards: the operator adds the certificate
   * volumes to the pod template but rolls the pods only once the set reached
   * its goal state — enabling TLS earlier deadlocks.
   */
  async finalizeMultiSiteTopology(params: { clusterId: string; projectId: string; kubeconfig: string }): Promise<{ primaryZone: string }> {
    return this.withDedicatedClients(params.kubeconfig, async () => {
      const namespace = this.getNamespace(params.projectId);
      const resourceName = this.getResourceName(params.clusterId);
      await this.waitForReplicaSetRunning(namespace, resourceName, 3, 20 * 60_000);

      const zones: string[] = [];
      for (const i of [0, 1]) {
        const { body: pod } = await this.coreApi.readNamespacedPod(`${resourceName}-${i}`, namespace);
        const { body: node } = await this.coreApi.readNode(pod.spec!.nodeName!);
        zones.push(node.metadata?.labels?.['topology.kubernetes.io/zone'] ?? '?');
      }
      if (zones[0] !== 'fsn1' || zones[1] === 'fsn1') {
        throw new Error(`Data members of ${resourceName} are misplaced (${zones.join(', ')})`);
      }
      this.logger.log(`Multi-site ${resourceName} running: data ${zones.join(' + ')}, arbiter fsn1`);
      return { primaryZone: 'fsn1' };
    });
  }

  /**
   * Turn on TLS for an operator-managed replica set and publish each member on
   * its own NodePort, advertised via a replica-set horizon (m<i>.<dnsBase>:<port>)
   * so drivers outside Kubernetes can discover and fail over between members.
   * `optional` keeps accepting plaintext clients during a migration window.
   */
  async configureClusterTls(params: {
    clusterId: string;
    projectId: string;
    plan: string;
    dnsBase: string;
    certPem: string;
    keyPem: string;
    caPem: string;
    mode: 'optional' | 'required';
  }): Promise<ClusterTlsTopology> {
    return this.onClusterNode(params.clusterId, () => this.configureClusterTlsOnNode(params));
  }

  /** In-cluster DNS name pattern covering every member pod (data and arbiter). */
  memberHostWildcard(clusterId: string, projectId: string): string {
    const resourceName = this.getResourceName(clusterId);
    return `*.${resourceName}-svc.${this.getNamespace(projectId)}.svc.cluster.local`;
  }

  private async configureClusterTlsOnNode(params: {
    clusterId: string;
    projectId: string;
    plan: string;
    dnsBase: string;
    certPem: string;
    keyPem: string;
    caPem: string;
    mode: 'optional' | 'required';
  }): Promise<ClusterTlsTopology> {
    if (!this.isOperatorManaged(params.plan)) {
      throw new Error(`TLS is available for operator-managed plans (MEDIUM and above), not ${params.plan}`);
    }
    const namespace = this.getNamespace(params.projectId);
    const resourceName = this.getResourceName(params.clusterId);
    const tlsSecret = `${resourceName}-tls`;
    const caConfigMap = `${resourceName}-ca`;
    const labels = { 'eutlas.eu/managed-by': 'eutlas', 'eutlas.eu/cluster': resourceName };

    await this.upsertSecret(namespace, {
      metadata: { name: tlsSecret, namespace, labels },
      type: 'kubernetes.io/tls',
      stringData: { 'tls.crt': params.certPem, 'tls.key': params.keyPem },
    });
    await this.upsertConfigMap(namespace, {
      metadata: { name: caConfigMap, namespace, labels },
      data: { 'ca.crt': params.caPem },
    });

    const { body: cr } = (await this.customApi.getNamespacedCustomObject(
      'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', resourceName,
    )) as { body: any };
    // See waitForReplicaSetRunning: TLS on a set that never reached its goal
    // state deadlocks the operator's rolling restart.
    if (cr.status?.phase !== 'Running') {
      throw new Error(`Replica set ${resourceName} is ${cr.status?.phase ?? 'not running'}; enable TLS once it is Running`);
    }
    const memberCount: number = cr.spec.members;
    const arbiterCount: number = cr.spec.arbiters ?? 0;

    // The operator assigns replicaSetHorizons by process index: data members
    // first, then arbiters. Every member of a replica set config must carry
    // the same horizon names, and drivers also monitor arbiters, so arbiters
    // get a real, reachable horizon too (m<members + j>).
    const processes = [
      ...Array.from({ length: memberCount }, (_, i) => ({ podName: `${resourceName}-${i}`, arbiter: false })),
      ...Array.from({ length: arbiterCount }, (_, j) => ({ podName: `${resourceName}-arb-${j}`, arbiter: true })),
    ];
    const members: ClusterTlsTopology['members'] = [];
    for (const [i, proc] of processes.entries()) {
      // Arbiter pods share the data members' template, hence their app label.
      const port = await this.ensureMemberNodePort(namespace, resourceName, proc.podName, `${resourceName}-m${i}`);
      const host = await this.nodeIpOfPod(namespace, proc.podName);
      members.push({ index: i, podName: proc.podName, host, port, horizon: `m${i}.${params.dnsBase}:${port}`, arbiter: proc.arbiter });
    }

    await this.updateMongoDbResource(namespace, resourceName, (current) => {
      current.spec.security = {
        ...(current.spec.security || {}),
        tls: {
          enabled: true,
          optional: params.mode === 'optional',
          certificateKeySecretRef: { name: tlsSecret },
          caConfigMapRef: { name: caConfigMap },
        },
      };
      current.spec.replicaSetHorizons = members.map((m) => ({ external: m.horizon }));
    });
    this.logger.log(`TLS (${params.mode}) configured for ${resourceName}: ${members.map((m) => m.horizon).join(', ')}`);
    return { replicaSet: resourceName, members };
  }

  /** Waits until the operator reports the replica set Running with `processes` members incl. arbiters. */
  private async waitForReplicaSetRunning(namespace: string, name: string, processes: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let status: any = {};
    while (Date.now() < deadline) {
      const { body } = (await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', name,
      )) as { body: any };
      status = body.status ?? {};
      const total = (status.currentMongoDBMembers ?? 0) + (status.currentMongoDBArbiters ?? 0);
      if (status.phase === 'Running' && total >= processes) return;
      await new Promise((r) => setTimeout(r, 10_000));
    }
    throw new Error(`Replica set ${name} not Running after ${timeoutMs / 60_000} min: ${JSON.stringify(status)}`);
  }

  /**
   * Read-modify-replace a MongoDBCommunity resource, retrying on 409: the
   * operator updates the same object (status, annotations) concurrently.
   */
  private async updateMongoDbResource(namespace: string, name: string, mutate: (cr: any) => void): Promise<any> {
    for (let attempt = 1; ; attempt++) {
      const { body: cr } = (await this.customApi.getNamespacedCustomObject(
        'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', name,
      )) as { body: any };
      mutate(cr);
      try {
        await this.customApi.replaceNamespacedCustomObject(
          'mongodbcommunity.mongodb.com', 'v1', namespace, 'mongodbcommunity', name, cr,
        );
        return cr;
      } catch (error: any) {
        if (error.response?.statusCode !== 409 || attempt >= 5) throw error;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  /** NodePort service for exactly one member pod; returns its node port. */
  private async ensureMemberNodePort(namespace: string, resourceName: string, podName: string, serviceName: string): Promise<number> {
    try {
      await this.coreApi.createNamespacedService(namespace, {
        metadata: {
          name: serviceName,
          namespace,
          labels: { 'eutlas.eu/managed-by': 'eutlas', 'eutlas.eu/cluster': resourceName, 'eutlas.eu/service-type': 'member-access' },
        },
        spec: {
          type: 'NodePort',
          // Preserve client source IPs for the IP access list (see createExternalService).
          externalTrafficPolicy: 'Local',
          selector: { app: `${resourceName}-svc`, 'statefulset.kubernetes.io/pod-name': podName },
          ports: [{ name: 'mongodb', port: 27017, targetPort: 27017, protocol: 'TCP' }],
        },
      });
    } catch (error: any) {
      if (error.response?.statusCode !== 409) throw error;
    }
    const { body } = await this.coreApi.readNamespacedService(serviceName, namespace);
    const port = body.spec?.ports?.[0]?.nodePort;
    if (!port) throw new Error(`Service ${serviceName} has no node port`);
    return port;
  }

  /** Public address of the node a pod runs on (ExternalIP, else InternalIP — public on Hetzner). */
  private async nodeIpOfPod(namespace: string, podName: string): Promise<string> {
    const { body: pod } = await this.coreApi.readNamespacedPod(podName, namespace);
    const nodeName = pod.spec?.nodeName;
    if (!nodeName) throw new Error(`Pod ${podName} is not scheduled yet`);
    const { body: node } = await this.coreApi.readNode(nodeName);
    const addresses = node.status?.addresses || [];
    const ip = (addresses.find((a) => a.type === 'ExternalIP') ?? addresses.find((a) => a.type === 'InternalIP'))?.address;
    if (!ip) throw new Error(`Node ${nodeName} has no address`);
    return ip;
  }

  private async upsertSecret(namespace: string, secret: k8s.V1Secret): Promise<void> {
    try {
      await this.coreApi.createNamespacedSecret(namespace, secret);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) throw error;
      await this.coreApi.replaceNamespacedSecret(secret.metadata!.name!, namespace, secret);
    }
  }

  private async upsertConfigMap(namespace: string, configMap: k8s.V1ConfigMap): Promise<void> {
    try {
      await this.coreApi.createNamespacedConfigMap(namespace, configMap);
    } catch (error: any) {
      if (error.response?.statusCode !== 409) throw error;
      await this.coreApi.replaceNamespacedConfigMap(configMap.metadata!.name!, namespace, configMap);
    }
  }

  /**
   * Platform health of the shared cluster for the admin MCP: node pressure and
   * reservations, pods that are not running, and long-running Jobs. Uses only
   * node status and pod specs (no nodes/proxy, which would grant kubelet exec).
   */
  async getPlatformDiagnostics(): Promise<PlatformDiagnostics> {
    if (this.shouldSimulate()) {
      return { nodes: [], unhealthyPods: [], longRunningJobs: [] };
    }
    const now = Date.now();
    const [nodes, pods, jobs] = await Promise.all([
      this.defaults.coreApi.listNode(),
      this.defaults.coreApi.listPodForAllNamespaces(),
      this.defaults.batchApi.listJobForAllNamespaces(),
    ]);

    const requestedMemGb = new Map<string, number>();
    const unhealthy = new Map<string, { count: number; reasons: Record<string, number>; examples: string[] }>();
    for (const pod of pods.body.items) {
      const phase = pod.status?.phase;
      const nodeName = pod.spec?.nodeName;
      if (nodeName && phase !== 'Succeeded' && phase !== 'Failed') {
        const mem = (pod.spec?.containers || []).reduce(
          (sum, c) => sum + (c.resources?.requests?.memory ? parseMemoryToGB(c.resources.requests.memory) : 0),
          0,
        );
        requestedMemGb.set(nodeName, (requestedMemGb.get(nodeName) ?? 0) + mem);
      }

      const waiting = (pod.status?.containerStatuses || []).find((cs) => cs.state?.waiting)?.state?.waiting?.reason;
      const ageMin = (now - new Date(pod.metadata?.creationTimestamp ?? now).getTime()) / 60_000;
      let reason: string | undefined;
      if (phase === 'Failed') reason = pod.status?.reason || 'Failed';
      else if (phase === 'Pending' && ageMin > 10) reason = 'Pending';
      else if (waiting && waiting !== 'ContainerCreating' && waiting !== 'PodInitializing') reason = waiting;
      if (!reason) continue;

      const ns = pod.metadata?.namespace ?? '?';
      const entry = unhealthy.get(ns) ?? { count: 0, reasons: {}, examples: [] };
      entry.count += 1;
      entry.reasons[reason] = (entry.reasons[reason] ?? 0) + 1;
      if (entry.examples.length < 5) entry.examples.push(pod.metadata?.name ?? '?');
      unhealthy.set(ns, entry);
    }

    return {
      nodes: nodes.body.items.map((node) => {
        const name = node.metadata?.name ?? '?';
        const condition = (type: string) => node.status?.conditions?.find((c) => c.type === type)?.status === 'True';
        const allocatableGb = parseMemoryToGB(node.status?.allocatable?.memory ?? '0');
        return {
          name,
          ready: condition('Ready'),
          diskPressure: condition('DiskPressure'),
          memoryPressure: condition('MemoryPressure'),
          pidPressure: condition('PIDPressure'),
          taints: (node.spec?.taints || []).map((t) => `${t.key}:${t.effect}`),
          memoryAllocatableGb: Math.round(allocatableGb * 10) / 10,
          memoryRequestedPercent: allocatableGb
            ? Math.round(((requestedMemGb.get(name) ?? 0) / allocatableGb) * 100)
            : null,
        };
      }),
      unhealthyPods: [...unhealthy.entries()]
        .map(([namespace, e]) => ({ namespace, ...e }))
        .sort((a, b) => b.count - a.count),
      longRunningJobs: jobs.body.items
        .filter((j) => (j.status?.active ?? 0) > 0)
        .map((j) => ({
          namespace: j.metadata?.namespace ?? '?',
          name: j.metadata?.name ?? '?',
          ageMinutes: Math.round((now - new Date(j.status?.startTime ?? j.metadata?.creationTimestamp ?? now).getTime()) / 60_000),
        }))
        .filter((j) => j.ageMinutes > 60)
        .sort((a, b) => b.ageMinutes - a.ageMinutes),
    };
  }

  // ========== Helper Methods ==========

  /**
   * Returns true if the plan uses the MongoDB Community Operator (MongoDBCommunity CRD).
   * DEV and SMALL use simple StatefulSets; everything else uses the operator.
   */
  private isOperatorManaged(plan: string): boolean {
    return isOperatorManagedPlan(plan);
  }

  private resolveMongoVersion(requestedVersion: string | undefined, useNativeVectorSearch?: boolean): string {
    const version = requestedVersion || DEFAULT_MONGO_VERSION;
    if (!useNativeVectorSearch) {
      return version;
    }

    if (!this.isMongoVersionAtLeast(version, NATIVE_VECTOR_SEARCH_MIN_VERSION)) {
      return NATIVE_VECTOR_SEARCH_MIN_VERSION;
    }

    return version;
  }

  private isMongoVersionAtLeast(version: string, minimum: string): boolean {
    const parse = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const [major = 0, minor = 0, patch = 0] = parse(version);
    const [minMajor = 0, minMinor = 0, minPatch = 0] = parse(minimum);

    if (major !== minMajor) return major > minMajor;
    if (minor !== minMinor) return minor > minMinor;
    return patch >= minPatch;
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

  /**
   * Selects a cluster's MongoDB pods: StatefulSet plans label them
   * app=<resourceName>, operator-managed plans app=<resourceName>-svc. The
   * policy used to match only the former, so it never applied to MEDIUM+.
   */
  private mongoPodSelector(resourceName: string): k8s.V1LabelSelector {
    return {
      matchExpressions: [{ key: 'app', operator: 'In', values: [resourceName, `${resourceName}-svc`] }],
    };
  }

  /** Public egress IPs of the platform cluster's nodes (backups, metrics, migration). */
  private get platformEgressCidrs(): string[] {
    return (this.configService.get<string>('PLATFORM_EGRESS_CIDRS') || '')
      .split(',')
      .map((cidr) => cidr.trim())
      .filter(Boolean);
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
