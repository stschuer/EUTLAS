import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SearchIndexDocument = SearchIndex & Document;

export type SearchIndexStatus = 'pending' | 'building' | 'ready' | 'failed' | 'deleting';
export type SearchIndexType = 'search' | 'vectorSearch';

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
export class SearchIndex {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  database: string;

  @Prop({ required: true })
  collection: string;

  @Prop({ required: true, enum: ['search', 'vectorSearch'], default: 'search' })
  type: SearchIndexType;

  @Prop({
    required: true,
    enum: ['pending', 'building', 'ready', 'failed', 'deleting'],
    default: 'pending',
  })
  status: SearchIndexStatus;

  @Prop({ type: Object, required: true })
  definition: {
    mappings?: {
      dynamic?: boolean;
      fields?: Record<string, {
        type: string;
        analyzer?: string;
        searchAnalyzer?: string;
        indexOptions?: string;
        store?: boolean;
        norms?: boolean;
      }>;
    };
    synonyms?: Array<{
      name: string;
      analyzer: string;
      source: {
        collection: string;
      };
    }>;
    // For vector search
    fields?: Array<{
      type: string;
      path: string;
      numDimensions?: number;
      similarity?: 'euclidean' | 'cosine' | 'dotProduct';
    }>;
  };

  @Prop()
  analyzer?: string;

  @Prop()
  searchAnalyzer?: string;

  @Prop({ default: 0 })
  documentCount?: number;

  @Prop({ default: 0 })
  storageSizeBytes?: number;

  @Prop()
  errorMessage?: string;

  @Prop()
  buildStartedAt?: Date;

  @Prop()
  buildCompletedAt?: Date;

  @Prop()
  lastQueryAt?: Date;

  @Prop({ default: 0 })
  queryCount?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SearchIndexSchema = SchemaFactory.createForClass(SearchIndex);

// Indexes
SearchIndexSchema.index({ clusterId: 1, database: 1, collection: 1 });
SearchIndexSchema.index({ clusterId: 1, name: 1 }, { unique: true });
SearchIndexSchema.index({ orgId: 1 });
SearchIndexSchema.index({ status: 1 });


