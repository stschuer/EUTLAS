import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VectorFieldDto {
  @ApiProperty({ example: 'embedding', description: 'Path to vector field in documents' })
  @IsString()
  path: string;

  @ApiProperty({ example: 1536, description: 'Vector dimensions' })
  @IsNumber()
  @Min(1)
  @Max(4096)
  dimensions: number;

  @ApiProperty({ enum: ['euclidean', 'cosine', 'dotProduct'], default: 'cosine' })
  @IsEnum(['euclidean', 'cosine', 'dotProduct'])
  similarity: 'euclidean' | 'cosine' | 'dotProduct';
}

export class FilterFieldDto {
  @ApiProperty({ example: 'category' })
  @IsString()
  path: string;

  @ApiProperty({ enum: ['string', 'number', 'boolean', 'date', 'objectId'] })
  @IsEnum(['string', 'number', 'boolean', 'date', 'objectId'])
  type: string;
}

export class CustomAnalyzerDto {
  @ApiProperty({ example: 'custom_english' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: ['htmlStrip'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  charFilters?: string[];

  @ApiProperty({ example: 'standard' })
  @IsString()
  tokenizer: string;

  @ApiPropertyOptional({ example: ['lowercase', 'snowballStemming'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tokenFilters?: string[];
}

export class CreateVectorIndexDto {
  @ApiProperty({ example: 'product_embeddings_idx' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'ecommerce' })
  @IsString()
  database: string;

  @ApiProperty({ example: 'products' })
  @IsString()
  collection: string;

  @ApiProperty({ enum: ['vectorSearch', 'search'], default: 'vectorSearch' })
  @IsOptional()
  @IsEnum(['vectorSearch', 'search'])
  type?: string;

  @ApiProperty({ type: [VectorFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VectorFieldDto)
  @ArrayMinSize(1)
  vectorFields: VectorFieldDto[];

  @ApiPropertyOptional({ type: [FilterFieldDto], description: 'Fields for filtering in hybrid search' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterFieldDto)
  filterFields?: FilterFieldDto[];

  @ApiPropertyOptional({ example: ['title', 'description'], description: 'Text fields for hybrid search' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  textFields?: string[];

  @ApiPropertyOptional({ type: CustomAnalyzerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomAnalyzerDto)
  analyzer?: CustomAnalyzerDto;
}

export class VectorSearchQueryDto {
  @ApiProperty({ description: 'Vector to search for', type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  vector: number[];

  @ApiProperty({ example: 'embedding', description: 'Path to vector field' })
  @IsString()
  path: string;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  numCandidates?: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Pre-filter to reduce search space' })
  @IsOptional()
  @IsObject()
  filter?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Fields to include in results' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeFields?: string[];
}

export class SemanticSearchDto {
  @ApiProperty({ example: 'How to implement user authentication?', description: 'Text query to search for' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  query: string;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter results' })
  @IsOptional()
  @IsObject()
  filter?: Record<string, any>;

  @ApiPropertyOptional({ 
    example: 'openai', 
    enum: ['openai', 'cohere', 'huggingface'],
    description: 'Embedding provider' 
  })
  @IsOptional()
  @IsEnum(['openai', 'cohere', 'huggingface'])
  embeddingProvider?: string;

  @ApiPropertyOptional({ example: 'text-embedding-3-small', description: 'Embedding model' })
  @IsOptional()
  @IsString()
  model?: string;
}

export class HybridSearchDto {
  @ApiProperty({ example: 'authentication tutorial', description: 'Text query' })
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: 'Vector for similarity search' })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  vector?: number[];

  @ApiPropertyOptional({ example: 0.5, description: 'Weight for vector search (0-1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vectorWeight?: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  filter?: Record<string, any>;
}





