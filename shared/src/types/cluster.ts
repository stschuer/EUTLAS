export type ClusterStatus =
  | 'creating'
  | 'ready'
  | 'updating'
  | 'deleting'
  | 'failed'
  | 'degraded'
  | 'stopped';

export type ClusterPlan =
  | 'DEV'      // 512MB RAM, 5GB Storage
  | 'SMALL'    // 1GB RAM, 20GB Storage
  | 'MEDIUM'   // 2GB RAM, 50GB Storage
  | 'LARGE'    // 4GB RAM, 100GB Storage
  | 'XLARGE';  // 8GB RAM, 200GB Storage

export interface Cluster {
  id: string;
  projectId: string;
  name: string;
  plan: ClusterPlan;
  status: ClusterStatus;
  mongoVersion: string;
  connectionHost?: string;
  connectionPort?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClusterWithCredentials extends Cluster {
  credentials: ClusterCredentials;
}

export interface ClusterCredentials {
  connectionString: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface CreateClusterRequest {
  name: string;
  plan: ClusterPlan;
  mongoVersion?: string;
}

export interface ResizeClusterRequest {
  plan: ClusterPlan;
}

export interface ClusterPlanDetails {
  plan: ClusterPlan;
  name: string;
  description: string;
  ramMB: number;
  storageSizeGB: number;
  pricePerMonth: number;
  recommended?: boolean;
}


