import { IsString, IsOptional, IsArray, IsNumber, IsBoolean, IsEnum, Min, Max, MaxLength, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'High CPU Alert', description: 'Name for the alert rule' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, example: 'Fires when CPU exceeds 80%' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, description: 'Specific cluster ID or null for all clusters' })
  @IsOptional()
  @IsString()
  clusterId?: string;

  @ApiProperty({ 
    enum: ['cpu_usage', 'memory_usage', 'storage_usage', 'connections', 'replication_lag', 'operations_per_sec', 'query_latency'],
    example: 'cpu_usage'
  })
  @IsEnum(['cpu_usage', 'memory_usage', 'storage_usage', 'connections', 'replication_lag', 'operations_per_sec', 'query_latency'])
  metricType: string;

  @ApiProperty({ enum: ['gt', 'gte', 'lt', 'lte', 'eq'], example: 'gt' })
  @IsEnum(['gt', 'gte', 'lt', 'lte', 'eq'])
  condition: string;

  @ApiProperty({ example: 80, description: 'Threshold value' })
  @IsNumber()
  threshold: number;

  @ApiProperty({ enum: ['info', 'warning', 'critical'], default: 'warning' })
  @IsOptional()
  @IsEnum(['info', 'warning', 'critical'])
  severity?: string;

  @ApiProperty({ required: false, default: 5, description: 'Minutes condition must be true' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  evaluationPeriodMinutes?: number;

  @ApiProperty({ required: false, default: 60, description: 'Minutes before re-alerting' })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(1440)
  cooldownMinutes?: number;

  @ApiProperty({ required: false, description: 'Notification channel IDs' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  notificationChannels?: string[];

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsEnum(['info', 'warning', 'critical'])
  severity?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  evaluationPeriodMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(1440)
  cooldownMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  notificationChannels?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AcknowledgeAlertDto {
  @ApiProperty({ required: false, example: 'Looking into it' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}




