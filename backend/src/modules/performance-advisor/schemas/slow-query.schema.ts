import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SlowQueryDocument = SlowQuery & Document;

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
export class SlowQuery {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, index: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  database: string;

  @Prop({ required: true })
  collection: string;

  @Prop({ required: true, enum: ['find', 'insert', 'update', 'delete', 'aggregate', 'count', 'findAndModify', 'getMore', 'command'] })
  operation: string;

  @Prop({ type: Object })
  query: Record<string, any>;

  @Prop({ type: Object })
  sort?: Record<string, any>;

  @Prop({ type: Object })
  projection?: Record<string, any>;

  @Prop({ required: true })
  executionTimeMs: number;

  @Prop({ default: 0 })
  docsExamined: number;

  @Prop({ default: 0 })
  docsReturned: number;

  @Prop({ default: 0 })
  keysExamined: number;

  @Prop()
  indexUsed?: string;

  @Prop({ default: false })
  collectionScan: boolean;

  @Prop({ type: Object })
  executionStats?: {
    stage: string;
    nReturned: number;
    executionTimeMillisEstimate: number;
    works: number;
    advanced: number;
    needTime: number;
    isEOF: boolean;
    inputStage?: any;
  };

  @Prop()
  planSummary?: string;

  @Prop()
  client?: string;

  @Prop()
  user?: string;

  @Prop({ required: true, index: true })
  timestamp: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SlowQuerySchema = SchemaFactory.createForClass(SlowQuery);

// Indexes for efficient querying
SlowQuerySchema.index({ clusterId: 1, timestamp: -1 });
SlowQuerySchema.index({ clusterId: 1, executionTimeMs: -1 });
SlowQuerySchema.index({ clusterId: 1, database: 1, collection: 1 });
SlowQuerySchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 days TTL




