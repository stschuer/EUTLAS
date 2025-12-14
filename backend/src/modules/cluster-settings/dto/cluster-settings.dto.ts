import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsObject, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectionPoolDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minPoolSize?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  maxPoolSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxIdleTimeMS?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  waitQueueTimeoutMS?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  connectTimeoutMS?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  socketTimeoutMS?: number;
}

export class WriteConcernDto {
  @ApiPropertyOptional()
  @IsOptional()
  w?: number | 'majority';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  j?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  wtimeout?: number;
}

export class ScheduledScalingDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Cron expression for schedule' })
  @IsString()
  cronSchedule: string;

  @ApiProperty({ enum: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'] })
  @IsString()
  targetPlan: string;

  @ApiPropertyOptional({ default: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateClusterSettingsDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  labels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  connectionPool?: ConnectionPoolDto;

  @ApiPropertyOptional({ enum: ['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'] })
  @IsOptional()
  @IsEnum(['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'])
  readPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  readConcern?: { level?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  writeConcern?: WriteConcernDto;

  @ApiPropertyOptional({ enum: [0, 1, 2] })
  @IsOptional()
  @IsNumber()
  profilingLevel?: 0 | 1 | 2;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  slowOpThresholdMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoPauseEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  autoPauseAfterDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  backupSettings?: {
    retentionDays?: number;
    preferredBackupWindow?: string;
    encrypted?: boolean;
    compressionEnabled?: boolean;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  alertThresholds?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  maintenancePreferences?: {
    preferredDay?: string;
    preferredHour?: number;
    autoMinorVersionUpgrade?: boolean;
  };
}

export class AddScheduledScalingDto extends ScheduledScalingDto {}

export class UpdateTagsDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  @IsObject()
  tags: Record<string, string>;
}

export class UpdateLabelsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  labels: string[];
}




