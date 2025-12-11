import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArchiveRuleDocument = ArchiveRule & Document;

export type ArchiveRuleStatus = 'active' | 'paused' | 'deleting';

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
export class ArchiveRule {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  database: string;

  @Prop({ required: true })
  collection: string;

  @Prop({
    required: true,
    enum: ['active', 'paused', 'deleting'],
    default: 'active',
  })
  status: ArchiveRuleStatus;

  // Archive criteria
  @Prop({ required: true })
  dateField: string; // Field to use for age calculation

  @Prop({ required: true })
  archiveAfterDays: number; // Archive documents older than X days

  @Prop({ type: Object })
  criteria?: {
    // Additional filter criteria
    query?: Record<string, any>;
  };

  // Partition settings
  @Prop({ type: [String] })
  partitionFields?: string[];

  // Storage settings
  @Prop({ default: 'standard' })
  storageClass: 'standard' | 'cold';

  @Prop({ default: 'gzip' })
  compressionType: 'gzip' | 'snappy' | 'zstd' | 'none';

  // Schedule
  @Prop({ default: '0 2 * * *' }) // Default: 2 AM daily
  schedule: string;

  @Prop()
  lastRunAt?: Date;

  @Prop()
  nextRunAt?: Date;

  // Stats
  @Prop({ default: 0 })
  documentsArchived: number;

  @Prop({ default: 0 })
  bytesArchived: number;

  @Prop({ default: 0 })
  totalRuns: number;

  @Prop()
  lastError?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ArchiveRuleSchema = SchemaFactory.createForClass(ArchiveRule);

ArchiveRuleSchema.index({ clusterId: 1, database: 1, collection: 1 });
ArchiveRuleSchema.index({ status: 1, nextRunAt: 1 });



