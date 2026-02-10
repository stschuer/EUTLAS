import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClusterStatus =
  | 'creating'
  | 'ready'
  | 'updating'
  | 'deleting'
  | 'failed'
  | 'degraded'
  | 'stopped'
  | 'pausing'
  | 'paused'
  | 'resuming';

export type ClusterPlan = 'DEV' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | 'XXL' | 'XXXL' | 'DEDICATED_L' | 'DEDICATED_XL';

export type ClusterDocument = Cluster & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.credentialsEncrypted;
      return ret;
    },
  },
})
export class Cluster {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'] })
  plan: ClusterPlan;

  @Prop({ enum: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'] })
  previousPlan?: ClusterPlan;

  @Prop({
    required: true,
    enum: ['creating', 'ready', 'updating', 'deleting', 'failed', 'degraded', 'stopped', 'pausing', 'paused', 'resuming'],
    default: 'creating',
  })
  status: ClusterStatus;

  @Prop()
  pausedAt?: Date;

  @Prop()
  pauseReason?: string;

  @Prop({ default: '7.0.0' })
  mongoVersion: string;

  @Prop()
  connectionHost?: string;

  @Prop()
  connectionPort?: number;

  @Prop()
  srvHost?: string;

  @Prop()
  replicaSetName?: string;

  @Prop()
  externalHost?: string;

  @Prop()
  externalPort?: number;

  @Prop({ default: 'fsn1' })
  region?: string;

  @Prop()
  k8sNamespace?: string;

  @Prop()
  k8sResourceName?: string;

  @Prop({ required: true })
  credentialsEncrypted: string;

  @Prop({ default: false })
  vectorSearchEnabled: boolean;

  @Prop()
  vectorDbHost?: string;

  @Prop()
  vectorDbPort?: number;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  clonedFrom?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ClusterSchema = SchemaFactory.createForClass(Cluster);

// Indexes
ClusterSchema.index({ projectId: 1, name: 1 }, { unique: true });
ClusterSchema.index({ projectId: 1 });
ClusterSchema.index({ orgId: 1 });
ClusterSchema.index({ status: 1 });
