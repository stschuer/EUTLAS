import { IsString, IsOptional, IsObject, IsNumber, IsBoolean, IsArray, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDatabaseDto {
  @ApiProperty({ example: 'myDatabase' })
  @IsString()
  @MaxLength(64)
  name: string;
}

export class CreateCollectionDto {
  @ApiProperty({ example: 'myCollection' })
  @IsString()
  @MaxLength(64)
  name: string;
}

export class QueryDocumentsDto {
  @ApiProperty({ required: false, example: { status: 'active' } })
  @IsOptional()
  @IsObject()
  filter?: Record<string, any>;

  @ApiProperty({ required: false, example: { createdAt: -1 } })
  @IsOptional()
  @IsObject()
  sort?: Record<string, 1 | -1>;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  skip?: number;

  @ApiProperty({ required: false, default: 20, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false, example: { name: 1, email: 1 } })
  @IsOptional()
  @IsObject()
  projection?: Record<string, 0 | 1>;
}

export class InsertDocumentDto {
  @ApiProperty({ example: { name: 'John', email: 'john@example.com' } })
  @IsObject()
  document: Record<string, any>;
}

export class UpdateDocumentDto {
  @ApiProperty({ example: { name: 'John Updated', email: 'john@example.com' } })
  @IsObject()
  document: Record<string, any>;
}

export class DeleteDocumentsDto {
  @ApiProperty({ example: { status: 'inactive' } })
  @IsObject()
  filter: Record<string, any>;
}

export class CreateIndexDto {
  @ApiProperty({ example: { email: 1 }, description: 'Index key specification' })
  @IsObject()
  keys: Record<string, 1 | -1>;

  @ApiProperty({ required: false, example: 'email_unique' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  sparse?: boolean;

  @ApiProperty({ required: false, description: 'TTL in seconds' })
  @IsOptional()
  @IsNumber()
  expireAfterSeconds?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  background?: boolean;
}

export class RunAggregationDto {
  @ApiProperty({ 
    example: [
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ],
    description: 'Aggregation pipeline stages'
  })
  @IsArray()
  pipeline: Record<string, any>[];
}



