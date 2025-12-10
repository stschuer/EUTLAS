import { IsBoolean, IsNumber, IsString, IsEnum, IsOptional, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBackupPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 168 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(168)
  snapshotFrequencyHours?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  snapshotRetentionDays?: number;

  @ApiPropertyOptional({ enum: ['standard', 'gdpr', 'hipaa', 'pci-dss', 'sox', 'custom'] })
  @IsOptional()
  @IsEnum(['standard', 'gdpr', 'hipaa', 'pci-dss', 'sox', 'custom'])
  complianceLevel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  complianceTags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  retentionRules?: {
    hourly?: { keep: number };
    daily?: { keep: number };
    weekly?: { keep: number };
    monthly?: { keep: number };
    yearly?: { keep: number };
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pitrEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 35 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(35)
  pitrRetentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  crossRegionEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crossRegionTarget?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  encryptionEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  encryptionKeyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  backupWindow?: {
    enabled: boolean;
    startHour: number;
    durationHours: number;
    timezone: string;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alertOnFailure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alertOnSuccess?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alertRecipients?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  legalHoldEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalHoldReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  legalHoldUntil?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoExportEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  autoExportConfig?: {
    destination: 's3' | 'gcs' | 'azure' | 'hetzner';
    bucket: string;
    prefix?: string;
    frequency: 'daily' | 'weekly' | 'monthly';
  };
}

export class CompliancePresetDto {
  @ApiProperty({ enum: ['standard', 'gdpr', 'hipaa', 'pci-dss', 'sox'] })
  @IsEnum(['standard', 'gdpr', 'hipaa', 'pci-dss', 'sox'])
  preset: string;
}


