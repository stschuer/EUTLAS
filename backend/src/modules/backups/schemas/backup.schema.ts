import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BackupType = 'manual' | 'scheduled' | 'automated';
export type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'restoring' | 'deleted';
export type BackupStorageType = 's3' | 'local' | 'azure' | 'gcs';

export type BackupDocument = Backup & Document;

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
export class Backup {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: ['manual', 'scheduled', 'automated'], default: 'manual' })
  type: BackupType;

  @Prop({ type: String, enum: ['pending', 'in_progress', 'completed', 'failed', 'restoring', 'deleted'], default: 'pending' })
  status: BackupStatus;

  @Prop()
  description?: string;

  // Storage information
  @Prop({ type: String, enum: ['s3', 'local', 'azure', 'gcs'], default: 'local' })
  storageType: BackupStorageType;

  @Prop()
  storagePath?: string;

  @Prop()
  storageUrl?: string;

  // Size tracking
  @Prop({ default: 0 })
  sizeBytes: number;

  @Prop({ default: 0 })
  compressedSizeBytes: number;

  // Timing
  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  expiresAt?: Date;

  // Retention
  @Prop({ default: 7 })
  retentionDays: number;

  // Point-in-time recovery
  @Prop({ default: false })
  pointInTimeEnabled: boolean;

  @Prop()
  oplogStartTime?: Date;

  @Prop()
  oplogEndTime?: Date;

  // Metadata
  @Prop()
  mongoVersion?: string;

  @Prop({ type: Object })
  metadata?: {
    databases?: string[];
    collections?: number;
    documents?: number;
    indexes?: number;
  };

  // Error tracking
  @Prop()
  errorMessage?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const BackupSchema = SchemaFactory.createForClass(Backup);

// Indexes
BackupSchema.index({ clusterId: 1, createdAt: -1 });
BackupSchema.index({ projectId: 1 });
BackupSchema.index({ status: 1 });
BackupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
BackupSchema.index({ type: 1, status: 1 });
