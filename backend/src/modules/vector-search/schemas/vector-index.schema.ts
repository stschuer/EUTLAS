import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VectorIndexDocument = VectorIndex & Document;

export type VectorIndexStatus = 'pending' | 'building' | 'ready' | 'failed' | 'deleting';
export type SimilarityFunction = 'euclidean' | 'cosine' | 'dotProduct';

@Schema({ timestamps: true })
export class VectorField {
  @Prop({ required: true })
  path: string; // Field path in documents (e.g., "embedding", "content_vector")

  @Prop({ required: true })
  dimensions: number; // Vector dimensions (e.g., 384, 768, 1536)

  @Prop({ required: true, enum: ['euclidean', 'cosine', 'dotProduct'], default: 'cosine' })
  similarity: SimilarityFunction;

  @Prop({ default: 'float32' })
  type: string; // Vector element type
}

@Schema({ timestamps: true })
export class FilterField {
  @Prop({ required: true })
  path: string;

  @Prop({ required: true, enum: ['string', 'number', 'boolean', 'date', 'objectId'] })
  type: string;
}

@Schema({ timestamps: true })
export class VectorIndex {
  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, index: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  database: string;

  @Prop({ required: true })
  collection: string;

  @Prop({ required: true, enum: ['vectorSearch', 'search'], default: 'vectorSearch' })
  type: string;

  @Prop({ required: true, enum: ['pending', 'building', 'ready', 'failed', 'deleting'], default: 'pending' })
  status: VectorIndexStatus;

  @Prop()
  errorMessage?: string;

  // Vector search specific
  @Prop({ type: [VectorField] })
  vectorFields: VectorField[];

  // Filter fields for hybrid search
  @Prop({ type: [FilterField] })
  filterFields: FilterField[];

  // Full-text search fields (for hybrid)
  @Prop({ type: [String] })
  textFields: string[];

  // Custom analyzer configuration
  @Prop({ type: Object })
  analyzer?: {
    name: string;
    charFilters?: string[];
    tokenizer: string;
    tokenFilters?: string[];
  };

  // Statistics
  @Prop({ default: 0 })
  documentCount: number;

  @Prop({ default: 0 })
  indexSizeBytes: number;

  @Prop()
  buildStartedAt?: Date;

  @Prop()
  buildCompletedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const VectorIndexSchema = SchemaFactory.createForClass(VectorIndex);

// Indexes
VectorIndexSchema.index({ clusterId: 1, database: 1, collection: 1, name: 1 }, { unique: true });
VectorIndexSchema.index({ status: 1 });


