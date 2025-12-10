import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OplogEntryDocument = OplogEntry & Document;

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
export class OplogEntry {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  timestamp: Date; // MongoDB oplog timestamp

  @Prop({ required: true })
  ts: number; // Unix timestamp for ordering

  @Prop({ type: String })
  h: string; // Unique hash for the operation

  @Prop({ 
    required: true, 
    enum: ['i', 'u', 'd', 'c', 'n'], // insert, update, delete, command, noop
  })
  op: 'i' | 'u' | 'd' | 'c' | 'n';

  @Prop({ required: true })
  ns: string; // Namespace (db.collection)

  @Prop({ type: Object })
  o: Record<string, any>; // Operation object

  @Prop({ type: Object })
  o2?: Record<string, any>; // Query object for updates

  @Prop({ default: false })
  compressed: boolean;

  @Prop()
  sizeBytes: number;

  @Prop()
  batchId?: string; // Group oplog entries by capture batch

  @Prop()
  createdAt: Date;
}

export const OplogEntrySchema = SchemaFactory.createForClass(OplogEntry);

// Indexes for efficient queries
OplogEntrySchema.index({ clusterId: 1, timestamp: 1 });
OplogEntrySchema.index({ clusterId: 1, ts: 1 });
OplogEntrySchema.index({ batchId: 1 });
// TTL index - entries expire based on retention policy (handled by service)
OplogEntrySchema.index({ createdAt: 1 });


