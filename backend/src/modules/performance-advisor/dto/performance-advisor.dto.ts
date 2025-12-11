import { IsString, IsOptional, IsNumber, IsObject, IsEnum, IsArray, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QuerySlowQueriesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  database?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  collection?: string;

  @ApiProperty({ required: false, default: 100, description: 'Minimum execution time in ms' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minExecutionTimeMs?: number;

  @ApiProperty({ required: false, default: 50, maximum: 200 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiProperty({ required: false, description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class ExplainQueryDto {
  @ApiProperty({ example: 'myDatabase' })
  @IsString()
  database: string;

  @ApiProperty({ example: 'myCollection' })
  @IsString()
  collection: string;

  @ApiProperty({ example: { status: 'active' }, description: 'Query filter' })
  @IsObject()
  query: Record<string, any>;

  @ApiProperty({ required: false, example: { createdAt: -1 } })
  @IsOptional()
  @IsObject()
  sort?: Record<string, any>;

  @ApiProperty({ required: false, enum: ['queryPlanner', 'executionStats', 'allPlansExecution'], default: 'executionStats' })
  @IsOptional()
  @IsEnum(['queryPlanner', 'executionStats', 'allPlansExecution'])
  verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution';
}

export class ApplyIndexSuggestionDto {
  @ApiProperty({ required: false, description: 'Custom index name' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  indexName?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  background?: boolean;
}

export class DismissIndexSuggestionDto {
  @ApiProperty({ required: false, example: 'Not needed for our use case' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AnalyzeQueryDto {
  @ApiProperty({ example: 'myDatabase' })
  @IsString()
  database: string;

  @ApiProperty({ example: 'myCollection' })
  @IsString()
  collection: string;

  @ApiProperty({ example: { status: 'active', userId: '123' }, description: 'Query filter to analyze' })
  @IsObject()
  query: Record<string, any>;

  @ApiProperty({ required: false, example: { createdAt: -1 } })
  @IsOptional()
  @IsObject()
  sort?: Record<string, any>;
}

export class ProfilerSettingsDto {
  @ApiProperty({ enum: ['off', 'slow', 'all'], description: 'Profiler level' })
  @IsEnum(['off', 'slow', 'all'])
  level: 'off' | 'slow' | 'all';

  @ApiProperty({ required: false, default: 100, description: 'Slow query threshold in ms' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  slowMs?: number;

  @ApiProperty({ required: false, default: 1.0, description: 'Sample rate (0.0 to 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  sampleRate?: number;
}



