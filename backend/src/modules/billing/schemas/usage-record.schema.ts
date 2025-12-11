import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UsageRecordDocument = UsageRecord & Document;

export type UsageType = 
  | 'cluster_hours'      // Hours cluster was running
  | 'storage_gb_hours'   // GB-hours of storage used
  | 'data_transfer_gb'   // GB transferred out
  | 'backup_storage_gb'  // GB of backup storage
  | 'iops'               // IO operations (for future)
  | 'connections';       // Peak connections (for future)

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
export class UsageRecord {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', index: true })
  clusterId?: Types.ObjectId;

  @Prop({ required: true, enum: ['cluster_hours', 'storage_gb_hours', 'data_transfer_gb', 'backup_storage_gb', 'iops', 'connections'] })
  usageType: UsageType;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unit: string; // 'hours', 'gb', 'gb-hours', 'count'

  @Prop()
  unitPriceCents: number; // Price per unit in cents

  @Prop()
  totalCents: number; // quantity * unitPrice

  @Prop({ required: true, index: true })
  billingPeriodStart: Date;

  @Prop({ required: true, index: true })
  billingPeriodEnd: Date;

  @Prop({ type: Object })
  metadata?: {
    planType?: string;
    clusterName?: string;
    region?: string;
    [key: string]: any;
  };

  @Prop({ default: false })
  invoiced: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Invoice' })
  invoiceId?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const UsageRecordSchema = SchemaFactory.createForClass(UsageRecord);

// Indexes for efficient querying
UsageRecordSchema.index({ orgId: 1, billingPeriodStart: 1, billingPeriodEnd: 1 });
UsageRecordSchema.index({ clusterId: 1, usageType: 1 });
UsageRecordSchema.index({ invoiced: 1, billingPeriodEnd: 1 });



