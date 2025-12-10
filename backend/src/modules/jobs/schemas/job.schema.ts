import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobType =
  | 'CREATE_CLUSTER'
  | 'RESIZE_CLUSTER'
  | 'DELETE_CLUSTER'
  | 'PAUSE_CLUSTER'
  | 'RESUME_CLUSTER'
  | 'BACKUP_CLUSTER'
  | 'RESTORE_CLUSTER'
  | 'SYNC_STATUS';

export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'failed'
  | 'canceled';

export type JobDocument = Job & Document;

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
export class Job {
  id: string;

  @Prop({
    required: true,
    enum: [
      'CREATE_CLUSTER',
      'RESIZE_CLUSTER',
      'DELETE_CLUSTER',
      'PAUSE_CLUSTER',
      'RESUME_CLUSTER',
      'BACKUP_CLUSTER',
      'RESTORE_CLUSTER',
      'SYNC_STATUS',
    ],
  })
  type: JobType;

  @Prop({
    required: true,
    enum: ['pending', 'in_progress', 'success', 'failed', 'canceled'],
    default: 'pending',
  })
  status: JobStatus;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  targetClusterId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  targetProjectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  targetOrgId?: Types.ObjectId;

  @Prop({ type: Object })
  payload?: Record<string, unknown>;

  @Prop({ type: Object })
  result?: Record<string, unknown>;

  @Prop()
  lastError?: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 3 })
  maxAttempts: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// Indexes
JobSchema.index({ status: 1, createdAt: 1 });
JobSchema.index({ targetClusterId: 1 });
JobSchema.index({ type: 1 });
