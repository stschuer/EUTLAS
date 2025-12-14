export type BackupStatus =
  | 'scheduled'
  | 'running'
  | 'success'
  | 'failed';

export type BackupType =
  | 'automatic'
  | 'manual';

export interface Backup {
  id: string;
  clusterId: string;
  type: BackupType;
  status: BackupStatus;
  sizeBytes?: number;
  storagePath?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

export interface CreateBackupRequest {
  clusterId: string;
}

export interface RestoreBackupRequest {
  backupId: string;
  targetClusterId?: string; // Optional: restore to different cluster
}




