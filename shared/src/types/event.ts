export type EventType =
  | 'CLUSTER_CREATED'
  | 'CLUSTER_UPDATED'
  | 'CLUSTER_RESIZED'
  | 'CLUSTER_DELETED'
  | 'CLUSTER_FAILED'
  | 'CLUSTER_READY'
  | 'CLUSTER_DEGRADED'
  | 'CLUSTER_PAUSED'
  | 'CLUSTER_RESUMED'
  | 'BACKUP_STARTED'
  | 'BACKUP_COMPLETED'
  | 'BACKUP_FAILED'
  | 'BACKUP_DELETED'
  | 'BACKUP_RESTORE_STARTED'
  | 'BACKUP_RESTORE_COMPLETED'
  | 'RESTORE_STARTED'
  | 'RESTORE_COMPLETED'
  | 'RESTORE_FAILED'
  | 'PITR_ENABLED'
  | 'PITR_DISABLED'
  | 'PITR_RESTORE_STARTED'
  | 'PITR_RESTORE_COMPLETED'
  | 'PITR_RESTORE_FAILED'
  | 'OPLOG_CAPTURED'
  | 'USER_INVITED'
  | 'USER_JOINED'
  | 'USER_REMOVED'
  | 'DATABASE_USER_CREATED'
  | 'DATABASE_USER_DELETED'
  | 'NETWORK_ACCESS_UPDATED'
  | 'ALERT_TRIGGERED'
  | 'ALERT_RESOLVED'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'CLUSTER_SCALING_STARTED'
  | 'CLUSTER_SCALING_COMPLETED'
  | 'CLUSTER_MODIFIED'
  | 'SSO_CONFIG_CREATED'
  | 'SSO_CONFIG_DELETED'
  | 'SSO_LOGIN'
  | 'VECTOR_INDEX_CREATED'
  | 'VECTOR_INDEX_DELETED';

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


