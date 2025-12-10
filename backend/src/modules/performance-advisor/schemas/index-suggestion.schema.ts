import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IndexSuggestionDocument = IndexSuggestion & Document;

export type SuggestionStatus = 'pending' | 'applied' | 'dismissed' | 'expired';
export type ImpactLevel = 'high' | 'medium' | 'low';

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
export class IndexSuggestion {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, index: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  database: string;

  @Prop({ required: true })
  collection: string;

  @Prop({ type: Object, required: true })
  suggestedIndex: Record<string, 1 | -1>;

  @Prop()
  suggestedIndexName?: string;

  @Prop({ required: true, enum: ['high', 'medium', 'low'] })
  impact: ImpactLevel;

  @Prop({ required: true })
  reason: string;

  @Prop({ default: 0 })
  avgExecutionTimeMs: number;

  @Prop({ default: 0 })
  queryCount: number;

  @Prop({ type: [String], default: [] })
  sampleQueries: string[];

  @Prop({ default: 0 })
  estimatedImprovementPercent: number;

  @Prop({ required: true, enum: ['pending', 'applied', 'dismissed', 'expired'], default: 'pending' })
  status: SuggestionStatus;

  @Prop()
  appliedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  appliedBy?: Types.ObjectId;

  @Prop()
  dismissedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  dismissedBy?: Types.ObjectId;

  @Prop()
  dismissReason?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const IndexSuggestionSchema = SchemaFactory.createForClass(IndexSuggestion);

// Indexes
IndexSuggestionSchema.index({ clusterId: 1, status: 1 });
IndexSuggestionSchema.index({ clusterId: 1, database: 1, collection: 1 });
IndexSuggestionSchema.index({ impact: 1, status: 1 });


