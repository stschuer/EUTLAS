import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PitrRestoreDocument = PitrRestore & Document;

export type PitrRestoreStatus = 
  | 'pending'
  | 'preparing'
  | 'restoring_snapshot'
  | 'applying_oplog'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
export class PitrRestore {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  sourceClusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  targetClusterId?: Types.ObjectId; // If restoring to different cluster

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true })
  restorePointTimestamp: Date; // The exact timestamp to restore to

  @Prop({ type: Types.ObjectId, ref: 'Backup' })
  baseSnapshotId?: Types.ObjectId; // The snapshot used as base

  @Prop({
    required: true,
    enum: [
      'pending',
      'preparing',
      'restoring_snapshot',
      'applying_oplog',
      'verifying',
      'completed',
      'failed',
      'cancelled',
    ],
    default: 'pending',
  })
  status: PitrRestoreStatus;

  @Prop({ default: 0 })
  progress: number; // 0-100

  @Prop()
  currentStep?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  initiatedBy: Types.ObjectId;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ default: 0 })
  oplogEntriesApplied: number;

  @Prop({ default: 0 })
  totalOplogEntries: number;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Object })
  metadata?: {
    snapshotTimestamp?: Date;
    oplogStartTs?: number;
    oplogEndTs?: number;
    databasesRestored?: string[];
    collectionsRestored?: number;
  };

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PitrRestoreSchema = SchemaFactory.createForClass(PitrRestore);

// Indexes
PitrRestoreSchema.index({ sourceClusterId: 1, createdAt: -1 });
PitrRestoreSchema.index({ orgId: 1, createdAt: -1 });
PitrRestoreSchema.index({ status: 1 });




