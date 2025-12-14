import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export type AuditAction = 
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'READ'
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'INVITE_SENT' | 'INVITE_ACCEPTED' | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED' | 'API_KEY_CREATED' | 'API_KEY_DELETED'
  | 'CLUSTER_CREATED' | 'CLUSTER_DELETED' | 'CLUSTER_RESIZED'
  | 'CLUSTER_PAUSED' | 'CLUSTER_RESUMED'
  | 'BACKUP_CREATED' | 'BACKUP_RESTORED' | 'BACKUP_DELETED'
  | 'ALERT_TRIGGERED' | 'ALERT_RESOLVED'
  | 'SETTINGS_CHANGED' | 'PERMISSION_GRANTED' | 'PERMISSION_REVOKED';

export type AuditResourceType =
  | 'organization' | 'project' | 'cluster' | 'user'
  | 'database_user' | 'ip_whitelist' | 'backup' | 'api_key'
  | 'alert_rule' | 'notification_channel' | 'invitation'
  | 'archive_rule' | 'maintenance_window' | 'log_forwarding';

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
export class AuditLog {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  orgId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  clusterId?: Types.ObjectId;

  @Prop({ required: true })
  action: AuditAction;

  @Prop({ required: true })
  resourceType: AuditResourceType;

  @Prop()
  resourceId?: string;

  @Prop()
  resourceName?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop()
  actorEmail?: string;

  @Prop()
  actorType: 'user' | 'api_key' | 'system';

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ type: Object })
  previousState?: Record<string, any>;

  @Prop({ type: Object })
  newState?: Record<string, any>;

  @Prop({ type: Object })
  changes?: Record<string, { from: any; to: any }>;

  @Prop()
  description?: string;

  @Prop({ default: 'success' })
  status: 'success' | 'failure';

  @Prop()
  errorMessage?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: true })
  timestamp: Date;

  @Prop()
  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes for efficient querying
AuditLogSchema.index({ orgId: 1, timestamp: -1 });
AuditLogSchema.index({ projectId: 1, timestamp: -1 });
AuditLogSchema.index({ clusterId: 1, timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 });

// TTL index - keep audit logs for 2 years
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });




