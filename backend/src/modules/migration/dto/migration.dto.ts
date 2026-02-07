import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateSourceDto {
  @ApiProperty({ description: 'MongoDB connection URI of the source database', example: 'mongodb+srv://user:pass@cluster.mongodb.net' })
  @IsString()
  @IsNotEmpty()
  sourceUri: string;
}

export class MigrationOptionsDto {
  @ApiPropertyOptional({ description: 'Drop existing collections in target before restoring', default: true })
  @IsOptional()
  @IsBoolean()
  dropExisting?: boolean;

  @ApiPropertyOptional({ description: 'Preserve UUIDs from source (requires matching MongoDB versions)', default: false })
  @IsOptional()
  @IsBoolean()
  preserveUUIDs?: boolean;

  @ApiPropertyOptional({ description: 'Number of parallel collections to dump/restore simultaneously', default: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(16)
  numParallelCollections?: number;

  @ApiPropertyOptional({ description: 'Replay oplog entries for point-in-time consistency', default: false })
  @IsOptional()
  @IsBoolean()
  oplogReplay?: boolean;

  @ApiPropertyOptional({ description: 'Include all indexes in migration', default: true })
  @IsOptional()
  @IsBoolean()
  includeIndexes?: boolean;

  @ApiPropertyOptional({ description: 'Include GridFS buckets in migration', default: true })
  @IsOptional()
  @IsBoolean()
  includeGridFS?: boolean;

  @ApiPropertyOptional({ description: 'Compress data during transfer (uses gzip)', default: true })
  @IsOptional()
  @IsBoolean()
  compressTransfer?: boolean;
}

export class StartMigrationDto {
  @ApiProperty({ description: 'MongoDB connection URI of the source database' })
  @IsString()
  @IsNotEmpty()
  sourceUri: string;

  @ApiProperty({
    description: 'Source provider type',
    enum: ['atlas', 'self-hosted', 'digitalocean', 'aws-documentdb', 'other'],
  })
  @IsEnum(['atlas', 'self-hosted', 'digitalocean', 'aws-documentdb', 'other'])
  sourceProvider: 'atlas' | 'self-hosted' | 'digitalocean' | 'aws-documentdb' | 'other';

  @ApiPropertyOptional({
    description: 'Specific databases to migrate. If empty, all user databases are migrated.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  databases?: string[];

  @ApiPropertyOptional({
    description: 'Databases to exclude from migration',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeDatabases?: string[];

  @ApiPropertyOptional({
    description: 'Specific collections to migrate (format: "db.collection")',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collections?: string[];

  @ApiPropertyOptional({ description: 'Migration options' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MigrationOptionsDto)
  options?: MigrationOptionsDto;
}
