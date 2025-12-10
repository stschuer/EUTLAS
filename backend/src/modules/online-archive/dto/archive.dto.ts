import { IsString, IsNumber, IsOptional, IsEnum, IsObject, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateArchiveRuleDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  database: string;

  @ApiProperty()
  @IsString()
  collection: string;

  @ApiProperty({ description: 'Date field to use for age calculation' })
  @IsString()
  dateField: string;

  @ApiProperty({ description: 'Archive documents older than X days', minimum: 1 })
  @IsNumber()
  @Min(1)
  archiveAfterDays: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  criteria?: {
    query?: Record<string, any>;
  };

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  partitionFields?: string[];

  @ApiPropertyOptional({ enum: ['standard', 'cold'], default: 'standard' })
  @IsOptional()
  @IsEnum(['standard', 'cold'])
  storageClass?: 'standard' | 'cold';

  @ApiPropertyOptional({ enum: ['gzip', 'snappy', 'zstd', 'none'], default: 'gzip' })
  @IsOptional()
  @IsEnum(['gzip', 'snappy', 'zstd', 'none'])
  compressionType?: 'gzip' | 'snappy' | 'zstd' | 'none';

  @ApiPropertyOptional({ description: 'Cron schedule', default: '0 2 * * *' })
  @IsOptional()
  @IsString()
  schedule?: string;
}

export class UpdateArchiveRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  archiveAfterDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  criteria?: {
    query?: Record<string, any>;
  };

  @ApiPropertyOptional({ enum: ['standard', 'cold'] })
  @IsOptional()
  @IsEnum(['standard', 'cold'])
  storageClass?: 'standard' | 'cold';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schedule?: string;
}


