export interface PitrConfig {
  id: string;
  clusterId: string;
  orgId: string;
  projectId: string;
  enabled: boolean;
  retentionDays: number;
  enabledAt?: Date;
  oldestRestorePoint?: Date;
  latestRestorePoint?: Date;
  storageSizeBytes: number;
  status: 'healthy' | 'degraded' | 'inactive';
  lastOplogCaptureAt?: Date;
  settings: {
    captureIntervalMs?: number;
    compressionEnabled?: boolean;
    encryptionEnabled?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PitrRestoreWindow {
  enabled: boolean;
  oldestRestorePoint?: Date;
  latestRestorePoint?: Date;
  retentionDays: number;
  storageSizeBytes: number;
  status: 'healthy' | 'degraded' | 'inactive';
}

export interface OplogStats {
  totalEntries: number;
  storageSizeBytes: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  entriesByOperation: {
    inserts: number;
    updates: number;
    deletes: number;
    commands: number;
  };
}

export interface PitrRestore {
  id: string;
  sourceClusterId: string;
  targetClusterId?: string;
  orgId: string;
  projectId: string;
  restorePointTimestamp: Date;
  baseSnapshotId?: string;
  status: PitrRestoreStatus;
  progress: number;
  currentStep?: string;
  initiatedBy: string;
  startedAt?: Date;
  completedAt?: Date;
  oplogEntriesApplied: number;
  totalOplogEntries: number;
  errorMessage?: string;
  metadata?: {
    snapshotTimestamp?: Date;
    oplogStartTs?: number;
    oplogEndTs?: number;
    databasesRestored?: string[];
    collectionsRestored?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type PitrRestoreStatus =
  | 'pending'
  | 'preparing'
  | 'restoring_snapshot'
  | 'applying_oplog'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface EnablePitrRequest {
  retentionDays: number;
  settings?: {
    captureIntervalMs?: number;
    compressionEnabled?: boolean;
    encryptionEnabled?: boolean;
  };
}

export interface CreatePitrRestoreRequest {
  restorePointTimestamp: string;
  targetClusterId?: string;
}



