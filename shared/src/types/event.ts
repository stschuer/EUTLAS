export type EventType =
  | 'CLUSTER_CREATED'
  | 'CLUSTER_UPDATED'
  | 'CLUSTER_RESIZED'
  | 'CLUSTER_DELETED'
  | 'CLUSTER_FAILED'
  | 'CLUSTER_READY'
  | 'CLUSTER_DEGRADED'
  | 'BACKUP_STARTED'
  | 'BACKUP_COMPLETED'
  | 'BACKUP_FAILED'
  | 'RESTORE_STARTED'
  | 'RESTORE_COMPLETED'
  | 'RESTORE_FAILED'
  | 'USER_INVITED'
  | 'USER_JOINED'
  | 'USER_REMOVED';

export type EventSeverity = 'info' | 'warning' | 'error';

export interface Event {
  id: string;
  orgId: string;
  projectId?: string;
  clusterId?: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}


