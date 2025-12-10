import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScalingRecommendationDocument = ScalingRecommendation & Document;

export type RecommendationType = 'scale_up' | 'scale_down' | 'optimize' | 'no_change';
export type RecommendationStatus = 'pending' | 'active' | 'applied' | 'dismissed' | 'expired' | 'failed';
export type RecommendationPriority = 'low' | 'medium' | 'high' | 'critical';

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
export class ScalingRecommendation {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['scale_up', 'scale_down', 'optimize', 'no_change'],
  })
  type: RecommendationType;

  @Prop({
    required: true,
    enum: ['pending', 'active', 'applied', 'dismissed', 'expired', 'failed'],
    default: 'pending',
  })
  status: RecommendationStatus;

  @Prop({ default: 0.5 })
  confidence: number; // 0-1 confidence score for auto-scaling decisions

  @Prop({
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
  })
  priority: RecommendationPriority;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  currentPlan: string;

  @Prop()
  recommendedPlan?: string;

  @Prop({ type: Object })
  metrics: {
    avgCpuPercent?: number;
    maxCpuPercent?: number;
    avgMemoryPercent?: number;
    maxMemoryPercent?: number;
    avgStoragePercent?: number;
    avgConnections?: number;
    maxConnections?: number;
    avgOpsPerSec?: number;
  };

  @Prop({ type: Object })
  thresholds: {
    cpuThreshold?: number;
    memoryThreshold?: number;
    storageThreshold?: number;
    connectionThreshold?: number;
  };

  @Prop()
  estimatedMonthlySavings?: number; // For scale_down

  @Prop()
  estimatedMonthlyCost?: number; // For scale_up

  @Prop()
  reason: string;

  @Prop({ type: [String] })
  insights: string[];

  @Prop()
  analysisWindowStart: Date;

  @Prop()
  analysisWindowEnd: Date;

  @Prop()
  expiresAt: Date;

  @Prop()
  appliedAt?: Date;

  @Prop()
  dismissedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  dismissedBy?: Types.ObjectId;

  @Prop()
  dismissReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  appliedBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ScalingRecommendationSchema = SchemaFactory.createForClass(ScalingRecommendation);

// Indexes
ScalingRecommendationSchema.index({ clusterId: 1, status: 1, createdAt: -1 });
ScalingRecommendationSchema.index({ orgId: 1, status: 1 });
ScalingRecommendationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

