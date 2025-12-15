import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LogForwardingConfigDocument = LogForwardingConfig & Document;

export type LogDestinationType = 's3' | 'azure_blob' | 'gcs' | 'datadog' | 'splunk' | 'sumologic' | 'webhook';
export type LogType = 'mongodb' | 'audit' | 'profiler' | 'ftdc';

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.credentials;
      return ret;
    },
  },
})
export class LogForwardingConfig {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['s3', 'azure_blob', 'gcs', 'datadog', 'splunk', 'sumologic', 'webhook'],
  })
  destinationType: LogDestinationType;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ type: [String], default: ['mongodb'] })
  logTypes: LogType[];

  // S3 Config
  @Prop({ type: Object })
  s3Config?: {
    bucketName: string;
    region: string;
    prefix?: string;
    accessKeyId?: string;
    roleArn?: string;
  };

  // Azure Blob Config
  @Prop({ type: Object })
  azureBlobConfig?: {
    storageAccountName: string;
    containerName: string;
    prefix?: string;
  };

  // GCS Config
  @Prop({ type: Object })
  gcsConfig?: {
    bucketName: string;
    prefix?: string;
    serviceAccountEmail?: string;
  };

  // Datadog Config
  @Prop({ type: Object })
  datadogConfig?: {
    site: string; // e.g., 'datadoghq.com', 'datadoghq.eu'
    service?: string;
    source?: string;
    tags?: string[];
  };

  // Splunk Config
  @Prop({ type: Object })
  splunkConfig?: {
    host: string;
    port: number;
    index?: string;
    source?: string;
    sourcetype?: string;
    useTls: boolean;
  };

  // SumoLogic Config
  @Prop({ type: Object })
  sumologicConfig?: {
    collectorUrl: string;
    source?: string;
    category?: string;
  };

  // Webhook Config
  @Prop({ type: Object })
  webhookConfig?: {
    url: string;
    headers?: Record<string, string>;
    batchSize?: number;
    flushIntervalSeconds?: number;
  };

  // Encrypted credentials
  @Prop({ type: Object })
  credentials?: {
    s3SecretAccessKey?: string;
    azureConnectionString?: string;
    gcsServiceAccountKey?: string;
    datadogApiKey?: string;
    splunkHecToken?: string;
    webhookSecret?: string;
  };

  @Prop()
  lastLogSentAt?: Date;

  @Prop({ default: 0 })
  logsForwardedCount?: number;

  @Prop({ default: 0 })
  bytesForwardedTotal?: number;

  @Prop()
  lastError?: string;

  @Prop()
  lastErrorAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const LogForwardingConfigSchema = SchemaFactory.createForClass(LogForwardingConfig);

// Indexes
LogForwardingConfigSchema.index({ clusterId: 1 });
LogForwardingConfigSchema.index({ orgId: 1 });
LogForwardingConfigSchema.index({ enabled: 1 });





