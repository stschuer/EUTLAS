import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PitrConfigDocument = PitrConfig & Document;

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
export class PitrConfig {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, unique: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, default: false })
  enabled: boolean;

  @Prop({ required: true, default: 7 })
  retentionDays: number; // How long to keep oplog data (1-35 days like Atlas)

  @Prop({ type: Date })
  enabledAt?: Date;

  @Prop({ type: Date })
  oldestRestorePoint?: Date; // Earliest point we can restore to

  @Prop({ type: Date })
  latestRestorePoint?: Date; // Latest point we can restore to (usually near real-time)

  @Prop({ default: 0 })
  storageSizeBytes: number; // Total storage used by oplog data

  @Prop({ default: 'healthy', enum: ['healthy', 'degraded', 'inactive'] })
  status: 'healthy' | 'degraded' | 'inactive';

  @Prop()
  lastOplogCaptureAt?: Date;

  @Prop({ type: Object })
  settings: {
    captureIntervalMs?: number; // How often to capture oplog (simulated)
    compressionEnabled?: boolean;
    encryptionEnabled?: boolean;
  };

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PitrConfigSchema = SchemaFactory.createForClass(PitrConfig);

// Indexes
PitrConfigSchema.index({ clusterId: 1 });
PitrConfigSchema.index({ orgId: 1 });





