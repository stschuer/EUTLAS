import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AlertSeverity, AlertMetricType } from './alert-rule.schema';

export type AlertStatus = 'firing' | 'resolved' | 'acknowledged';

export type AlertHistoryDocument = AlertHistory & Document;

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
export class AlertHistory {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'AlertRule', required: true })
  alertRuleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ required: true })
  alertName: string;

  @Prop({ required: true, enum: ['cpu_usage', 'memory_usage', 'storage_usage', 'connections', 'replication_lag', 'operations_per_sec', 'query_latency'] })
  metricType: AlertMetricType;

  @Prop({ required: true, enum: ['info', 'warning', 'critical'] })
  severity: AlertSeverity;

  @Prop({ required: true, enum: ['firing', 'resolved', 'acknowledged'], default: 'firing' })
  status: AlertStatus;

  @Prop({ required: true })
  threshold: number;

  @Prop({ required: true })
  currentValue: number;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  firedAt: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  acknowledgedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acknowledgedBy?: Types.ObjectId;

  @Prop()
  acknowledgeNote?: string;

  @Prop({ type: [String], default: [] })
  notificationsSent: string[]; // Channel IDs that were notified

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const AlertHistorySchema = SchemaFactory.createForClass(AlertHistory);

// Indexes
AlertHistorySchema.index({ orgId: 1, status: 1, firedAt: -1 });
AlertHistorySchema.index({ clusterId: 1, status: 1 });
AlertHistorySchema.index({ alertRuleId: 1 });
AlertHistorySchema.index({ firedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 days TTL





