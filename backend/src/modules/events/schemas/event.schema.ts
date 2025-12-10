import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

export type EventDocument = Event & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Event {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  clusterId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: [
      'CLUSTER_CREATED',
      'CLUSTER_UPDATED',
      'CLUSTER_RESIZED',
      'CLUSTER_DELETED',
      'CLUSTER_FAILED',
      'CLUSTER_READY',
      'CLUSTER_DEGRADED',
      'CLUSTER_PAUSED',
      'CLUSTER_RESUMED',
      'BACKUP_STARTED',
      'BACKUP_COMPLETED',
      'BACKUP_FAILED',
      'BACKUP_DELETED',
      'BACKUP_RESTORE_STARTED',
      'BACKUP_RESTORE_COMPLETED',
      'RESTORE_STARTED',
      'RESTORE_COMPLETED',
      'RESTORE_FAILED',
      'PITR_ENABLED',
      'PITR_DISABLED',
      'PITR_RESTORE_STARTED',
      'PITR_RESTORE_COMPLETED',
      'PITR_RESTORE_FAILED',
      'OPLOG_CAPTURED',
      'USER_INVITED',
      'USER_JOINED',
      'USER_REMOVED',
      'DATABASE_USER_CREATED',
      'DATABASE_USER_DELETED',
      'NETWORK_ACCESS_UPDATED',
      'ALERT_TRIGGERED',
      'ALERT_RESOLVED',
      'API_KEY_CREATED',
      'API_KEY_REVOKED',
      'CLUSTER_SCALING_STARTED',
      'CLUSTER_SCALING_COMPLETED',
      'CLUSTER_MODIFIED',
      'SSO_CONFIG_CREATED',
      'SSO_CONFIG_DELETED',
      'SSO_LOGIN',
      'VECTOR_INDEX_CREATED',
      'VECTOR_INDEX_DELETED',
    ],
  })
  type: EventType;

  @Prop({ required: true, enum: ['info', 'warning', 'error'], default: 'info' })
  severity: EventSeverity;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  createdAt: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// Indexes
EventSchema.index({ clusterId: 1, createdAt: -1 });
EventSchema.index({ projectId: 1, createdAt: -1 });
EventSchema.index({ orgId: 1, createdAt: -1 });
