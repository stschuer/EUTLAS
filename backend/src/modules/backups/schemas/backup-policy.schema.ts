import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BackupPolicyDocument = BackupPolicy & Document;

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
export class BackupPolicy {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, unique: true })
  clusterId: Types.ObjectId;

  @Prop({ default: true })
  isEnabled: boolean;

  // Snapshot scheduling
  @Prop({ default: 24 })
  snapshotFrequencyHours: number; // How often to take snapshots

  @Prop({ default: 7 })
  snapshotRetentionDays: number; // How long to keep snapshots

  // Compliance settings
  @Prop({
    type: String,
    enum: ['standard', 'gdpr', 'hipaa', 'pci-dss', 'sox', 'custom'],
    default: 'standard',
  })
  complianceLevel: string;

  @Prop({ type: [String], default: [] })
  complianceTags: string[]; // e.g., ['eu-data', 'pii', 'financial']

  // Retention rules
  @Prop({ type: Object, default: {} })
  retentionRules: {
    hourly?: { keep: number }; // Keep last N hourly snapshots
    daily?: { keep: number };  // Keep last N daily snapshots
    weekly?: { keep: number }; // Keep last N weekly snapshots
    monthly?: { keep: number }; // Keep last N monthly snapshots
    yearly?: { keep: number };  // Keep last N yearly snapshots
  };

  // Point-in-time recovery
  @Prop({ default: false })
  pitrEnabled: boolean;

  @Prop({ default: 7 })
  pitrRetentionDays: number;

  // Cross-region backup copy
  @Prop({ default: false })
  crossRegionEnabled: boolean;

  @Prop()
  crossRegionTarget?: string; // Target region for backup copies

  // Encryption
  @Prop({ default: true })
  encryptionEnabled: boolean;

  @Prop()
  encryptionKeyId?: string; // For BYOK

  // Backup window (to avoid performance impact during peak hours)
  @Prop({ type: Object })
  backupWindow?: {
    enabled: boolean;
    startHour: number; // 0-23
    durationHours: number;
    timezone: string;
  };

  // Alerts
  @Prop({ default: true })
  alertOnFailure: boolean;

  @Prop({ default: false })
  alertOnSuccess: boolean;

  @Prop({ type: [String], default: [] })
  alertRecipients: string[]; // Email addresses

  // Legal hold (prevent deletion)
  @Prop({ default: false })
  legalHoldEnabled: boolean;

  @Prop()
  legalHoldReason?: string;

  @Prop()
  legalHoldUntil?: Date;

  // Auto-export
  @Prop({ default: false })
  autoExportEnabled: boolean;

  @Prop({ type: Object })
  autoExportConfig?: {
    destination: 's3' | 'gcs' | 'azure' | 'hetzner';
    bucket: string;
    prefix?: string;
    frequency: 'daily' | 'weekly' | 'monthly';
  };

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const BackupPolicySchema = SchemaFactory.createForClass(BackupPolicy);




