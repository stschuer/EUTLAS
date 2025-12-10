import { IsBoolean, IsInt, IsOptional, IsDateString, Min, Max, IsString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnablePitrDto {
  @ApiProperty({ description: 'Number of days to retain oplog data', minimum: 1, maximum: 35, default: 7 })
  @IsInt()
  @Min(1)
  @Max(35)
  retentionDays: number = 7;

  @ApiPropertyOptional({ description: 'Additional settings' })
  @IsOptional()
  @IsObject()
  settings?: {
    captureIntervalMs?: number;
    compressionEnabled?: boolean;
    encryptionEnabled?: boolean;
  };
}

export class UpdatePitrConfigDto {
  @ApiPropertyOptional({ description: 'Number of days to retain oplog data', minimum: 1, maximum: 35 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(35)
  retentionDays?: number;

  @ApiPropertyOptional({ description: 'Additional settings' })
  @IsOptional()
  @IsObject()
  settings?: {
    captureIntervalMs?: number;
    compressionEnabled?: boolean;
    encryptionEnabled?: boolean;
  };
}

export class CreatePitrRestoreDto {
  @ApiProperty({ description: 'The exact timestamp to restore to (ISO 8601 format)' })
  @IsDateString()
  restorePointTimestamp: string;

  @ApiPropertyOptional({ description: 'Target cluster ID (if restoring to different cluster)' })
  @IsOptional()
  @IsString()
  targetClusterId?: string;
}

export class GetRestoreWindowDto {
  @ApiPropertyOptional({ description: 'Specific date to check restore window for' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class PitrRestoreWindowResponse {
  enabled: boolean;
  oldestRestorePoint?: Date;
  latestRestorePoint?: Date;
  retentionDays: number;
  storageSizeBytes: number;
  status: 'healthy' | 'degraded' | 'inactive';
}

export class OplogStatsResponse {
  totalEntries: number;
  storageSizeBytes: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  entriesByOperation: {
    inserts: number;
    updates: number;
    deletes: number;
    commands: number;
  };
}


