import { IsString, IsEnum, IsOptional, IsObject, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FieldMappingDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  analyzer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  searchAnalyzer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  indexOptions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  store?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  norms?: boolean;
}

export class MappingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dynamic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fields?: Record<string, FieldMappingDto>;
}

export class VectorFieldDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  path: string;

  @ApiPropertyOptional()
  @IsOptional()
  numDimensions?: number;

  @ApiPropertyOptional({ enum: ['euclidean', 'cosine', 'dotProduct'] })
  @IsOptional()
  @IsEnum(['euclidean', 'cosine', 'dotProduct'])
  similarity?: 'euclidean' | 'cosine' | 'dotProduct';
}

export class SearchIndexDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MappingsDto)
  mappings?: MappingsDto;

  @ApiPropertyOptional({ type: [VectorFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VectorFieldDto)
  fields?: VectorFieldDto[];
}

export class CreateSearchIndexDto {
  @ApiProperty({ description: 'Index name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Database name' })
  @IsString()
  database: string;

  @ApiProperty({ description: 'Collection name' })
  @IsString()
  collection: string;

  @ApiProperty({ enum: ['search', 'vectorSearch'], default: 'search' })
  @IsEnum(['search', 'vectorSearch'])
  type: 'search' | 'vectorSearch';

  @ApiProperty({ type: SearchIndexDefinitionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => SearchIndexDefinitionDto)
  definition: SearchIndexDefinitionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  analyzer?: string;
}

export class UpdateSearchIndexDto {
  @ApiPropertyOptional({ type: SearchIndexDefinitionDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SearchIndexDefinitionDto)
  definition?: SearchIndexDefinitionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  analyzer?: string;
}

export class TestSearchDto {
  @ApiProperty({ description: 'Search query' })
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: 'Search path (for vector search)' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: 'Limit results' })
  @IsOptional()
  limit?: number;
}





