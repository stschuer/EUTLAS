import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClusterSettingsDocument = ClusterSettings & Document;

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
export class ClusterSettings {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, unique: true })
  clusterId: Types.ObjectId;

  // Tags & Labels
  @Prop({ type: Map, of: String, default: {} })
  tags: Map<string, string>;

  @Prop({ type: [String], default: [] })
  labels: string[];

  // Connection Pool Settings
  @Prop({ type: Object, default: {} })
  connectionPool: {
    minPoolSize?: number;
    maxPoolSize?: number;
    maxIdleTimeMS?: number;
    waitQueueTimeoutMS?: number;
    connectTimeoutMS?: number;
    socketTimeoutMS?: number;
  };

  // Read/Write Concern
  @Prop({ default: 'primary' })
  readPreference: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';

  @Prop({ type: Object, default: {} })
  readConcern: {
    level?: 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot';
  };

  @Prop({ type: Object, default: {} })
  writeConcern: {
    w?: number | 'majority';
    j?: boolean;
    wtimeout?: number;
  };

  // Profiling
  @Prop({ default: 0 })
  profilingLevel: 0 | 1 | 2;

  @Prop({ default: 100 })
  slowOpThresholdMs: number;

  // Auto-pause settings
  @Prop({ default: false })
  autoPauseEnabled: boolean;

  @Prop({ default: 7 })
  autoPauseAfterDays: number;

  // Scheduled scaling
  @Prop({ type: [Object], default: [] })
  scheduledScaling: Array<{
    id: string;
    name: string;
    enabled: boolean;
    cronSchedule: string;
    targetPlan: string;
    timezone: string;
  }>;

  // Backup settings
  @Prop({ type: Object, default: {} })
  backupSettings: {
    retentionDays?: number;
    preferredBackupWindow?: string;
    encrypted?: boolean;
    compressionEnabled?: boolean;
  };

  // Alert thresholds override
  @Prop({ type: Object, default: {} })
  alertThresholds: {
    cpuWarning?: number;
    cpuCritical?: number;
    memoryWarning?: number;
    memoryCritical?: number;
    storageWarning?: number;
    storageCritical?: number;
    connectionsWarning?: number;
    connectionsCritical?: number;
  };

  // Maintenance preferences
  @Prop({ type: Object, default: {} })
  maintenancePreferences: {
    preferredDay?: string;
    preferredHour?: number;
    autoMinorVersionUpgrade?: boolean;
  };

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ClusterSettingsSchema = SchemaFactory.createForClass(ClusterSettings);



