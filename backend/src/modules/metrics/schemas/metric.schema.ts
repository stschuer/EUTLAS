import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MetricType = 
  | 'cpu_usage'
  | 'memory_usage'
  | 'storage_used'
  | 'storage_available'
  | 'connections_current'
  | 'connections_available'
  | 'operations_insert'
  | 'operations_query'
  | 'operations_update'
  | 'operations_delete'
  | 'network_in'
  | 'network_out'
  | 'replication_lag';

export type MetricDocument = Metric & Document;

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
export class Metric {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ 
    required: true, 
    enum: [
      'cpu_usage', 'memory_usage', 'storage_used', 'storage_available',
      'connections_current', 'connections_available',
      'operations_insert', 'operations_query', 'operations_update', 'operations_delete',
      'network_in', 'network_out', 'replication_lag'
    ],
  })
  type: MetricType;

  @Prop({ required: true })
  value: number;

  @Prop()
  unit?: string; // percent, bytes, count, ms

  @Prop({ required: true })
  timestamp: Date;

  @Prop()
  createdAt: Date;
}

export const MetricSchema = SchemaFactory.createForClass(Metric);

// Indexes for efficient querying
MetricSchema.index({ clusterId: 1, type: 1, timestamp: -1 });
MetricSchema.index({ clusterId: 1, timestamp: -1 });
MetricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 days TTL




