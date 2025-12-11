import { IsString, IsEnum, IsBoolean, IsOptional, IsObject, IsArray, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class S3ConfigDto {
  @ApiProperty()
  @IsString()
  bucketName: string;

  @ApiProperty()
  @IsString()
  region: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessKeyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secretAccessKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleArn?: string;
}

export class DatadogConfigDto {
  @ApiProperty()
  @IsString()
  site: string;

  @ApiProperty()
  @IsString()
  apiKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class SplunkConfigDto {
  @ApiProperty()
  @IsString()
  host: string;

  @ApiProperty()
  @IsNumber()
  port: number;

  @ApiProperty()
  @IsString()
  hecToken: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  index?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useTls?: boolean;
}

export class WebhookConfigDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  batchSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  flushIntervalSeconds?: number;
}

export class CreateLogForwardingDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['s3', 'azure_blob', 'gcs', 'datadog', 'splunk', 'sumologic', 'webhook'] })
  @IsEnum(['s3', 'azure_blob', 'gcs', 'datadog', 'splunk', 'sumologic', 'webhook'])
  destinationType: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: [String], default: ['mongodb'] })
  @IsOptional()
  @IsArray()
  logTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  s3Config?: S3ConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  datadogConfig?: DatadogConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  splunkConfig?: SplunkConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  webhookConfig?: WebhookConfigDto;
}

export class UpdateLogForwardingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  logTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  s3Config?: S3ConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  datadogConfig?: DatadogConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  splunkConfig?: SplunkConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  webhookConfig?: WebhookConfigDto;
}



