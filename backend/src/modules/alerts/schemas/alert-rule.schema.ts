import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlertMetricType = 
  | 'cpu_usage'
  | 'memory_usage'
  | 'storage_usage'
  | 'connections'
  | 'replication_lag'
  | 'operations_per_sec'
  | 'query_latency';

export type AlertCondition = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertRuleDocument = AlertRule & Document;

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
export class AlertRule {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  clusterId?: Types.ObjectId; // null = apply to all clusters in org

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ 
    required: true,
    enum: ['cpu_usage', 'memory_usage', 'storage_usage', 'connections', 'replication_lag', 'operations_per_sec', 'query_latency'],
  })
  metricType: AlertMetricType;

  @Prop({ required: true, enum: ['gt', 'gte', 'lt', 'lte', 'eq'] })
  condition: AlertCondition;

  @Prop({ required: true })
  threshold: number;

  @Prop({ required: true, enum: ['info', 'warning', 'critical'], default: 'warning' })
  severity: AlertSeverity;

  @Prop({ default: 5 })
  evaluationPeriodMinutes: number; // How long condition must be true

  @Prop({ default: 60 })
  cooldownMinutes: number; // Don't re-alert within this period

  @Prop({ type: [Types.ObjectId], ref: 'NotificationChannel', default: [] })
  notificationChannels: Types.ObjectId[];

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  lastTriggeredAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const AlertRuleSchema = SchemaFactory.createForClass(AlertRule);

// Indexes
AlertRuleSchema.index({ orgId: 1, enabled: 1 });
AlertRuleSchema.index({ clusterId: 1 });
AlertRuleSchema.index({ metricType: 1 });



