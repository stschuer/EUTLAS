import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBackupDto {
  @ApiProperty({ example: 'Daily Backup 2024-12-08', description: 'Name for the backup' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, example: 'Manual backup before deployment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, default: 7, example: 7, description: 'Number of days to retain backup' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  retentionDays?: number;
}

export class RestoreBackupDto {
  @ApiProperty({ required: false, example: 'restored-cluster', description: 'Name for the restored cluster (creates new cluster)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetClusterName?: string;

  @ApiProperty({ required: false, default: false, description: 'If true, restores to existing cluster (destructive)' })
  @IsOptional()
  @IsBoolean()
  restoreToSource?: boolean;
}

export class BackupScheduleDto {
  @ApiProperty({ example: true, description: 'Enable/disable scheduled backups' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ required: false, example: '0 2 * * *', description: 'Cron expression for backup schedule' })
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiProperty({ required: false, default: 7, description: 'Default retention for scheduled backups' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  retentionDays?: number;
}




