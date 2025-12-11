export type JobType =
  | 'CREATE_CLUSTER'
  | 'RESIZE_CLUSTER'
  | 'DELETE_CLUSTER'
  | 'BACKUP_CLUSTER'
  | 'RESTORE_CLUSTER'
  | 'SYNC_STATUS';

export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'failed'
  | 'canceled';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  targetClusterId?: string;
  targetProjectId?: string;
  targetOrgId?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  progress?: number; // 0-100
  message?: string;
}



