import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MigrationStatus =
  | 'pending'
  | 'validating'
  | 'analyzing'
  | 'dumping'
  | 'restoring'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MigrationProvider = 'atlas' | 'self-hosted' | 'digitalocean' | 'aws-documentdb' | 'other';

export type MigrationDocument = Migration & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      // Never expose the full source URI (contains credentials)
      if (ret.sourceUri) {
        ret.sourceUri = ret.sourceUri.replace(
          /\/\/([^:]+):([^@]+)@/,
          '//$1:****@',
        );
      }
      return ret;
    },
  },
})
export class Migration {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, index: true })
  targetClusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  targetProjectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  targetOrgId: Types.ObjectId;

  @Prop({ required: true })
  sourceUri: string;

  @Prop({
    required: true,
    enum: ['atlas', 'self-hosted', 'digitalocean', 'aws-documentdb', 'other'],
  })
  sourceProvider: MigrationProvider;

  @Prop({
    required: true,
    enum: [
      'pending',
      'validating',
      'analyzing',
      'dumping',
      'restoring',
      'verifying',
      'completed',
      'failed',
      'cancelled',
    ],
    default: 'pending',
  })
  status: MigrationStatus;

  @Prop({ default: 0 })
  progress: number;

  @Prop()
  currentStep?: string;

  // Source analysis results
  @Prop({ type: Object })
  sourceInfo?: {
    mongoVersion: string;
    replicaSet: boolean;
    replicaSetName?: string;
    totalSizeBytes: number;
    databases: Array<{
      name: string;
      sizeOnDisk: number;
      collections: number;
      indexes: number;
      documents: number;
    }>;
  };

  // Which databases/collections to migrate
  @Prop({ type: [String] })
  databases?: string[];

  @Prop({ type: [String] })
  excludeDatabases?: string[];

  @Prop({ type: [String] })
  collections?: string[];

  @Prop({ type: [String] })
  excludeCollections?: string[];

  // Migration options
  @Prop({ type: Object, default: {} })
  options: {
    dropExisting?: boolean;
    preserveUUIDs?: boolean;
    numParallelCollections?: number;
    oplogReplay?: boolean;
    includeIndexes?: boolean;
    includeGridFS?: boolean;
    compressTransfer?: boolean;
  };

  // Progress tracking per database
  @Prop({ type: [Object], default: [] })
  databaseProgress: Array<{
    name: string;
    status: 'pending' | 'dumping' | 'restoring' | 'verifying' | 'completed' | 'failed';
    collectionsTotal: number;
    collectionsCompleted: number;
    documentsTotal: number;
    documentsCompleted: number;
    sizeBytes: number;
    transferredBytes: number;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
  }>;

  // Overall stats
  @Prop({ type: Object, default: {} })
  stats: {
    totalDatabases: number;
    totalCollections: number;
    totalDocuments: number;
    totalIndexes: number;
    totalSizeBytes: number;
    transferredBytes: number;
    databasesCompleted: number;
    collectionsCompleted: number;
    documentsRestored: number;
    indexesRestored: number;
    startedAt?: Date;
    completedAt?: Date;
    durationMs?: number;
    transferRateBytesPerSec?: number;
  };

  // Verification results
  @Prop({ type: Object })
  verification?: {
    passed: boolean;
    checkedAt: Date;
    databaseChecks: Array<{
      name: string;
      sourceDocCount: number;
      targetDocCount: number;
      match: boolean;
      collectionChecks: Array<{
        name: string;
        sourceCount: number;
        targetCount: number;
        match: boolean;
      }>;
    }>;
  };

  @Prop()
  errorMessage?: string;

  @Prop({ type: [Object], default: [] })
  log: Array<{
    timestamp: Date;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ type: Types.ObjectId, ref: 'Job' })
  jobId?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MigrationSchema = SchemaFactory.createForClass(Migration);

// Indexes
MigrationSchema.index({ targetClusterId: 1, createdAt: -1 });
MigrationSchema.index({ status: 1 });
MigrationSchema.index({ targetOrgId: 1, createdAt: -1 });
