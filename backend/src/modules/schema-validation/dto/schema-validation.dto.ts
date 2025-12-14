import { IsString, IsObject, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSchemaDto {
  @ApiProperty()
  @IsString()
  database: string;

  @ApiProperty()
  @IsString()
  collection: string;

  @ApiProperty({ description: 'JSON Schema definition' })
  @IsObject()
  jsonSchema: Record<string, any>;

  @ApiPropertyOptional({ enum: ['off', 'strict', 'moderate'], default: 'strict' })
  @IsOptional()
  @IsEnum(['off', 'strict', 'moderate'])
  validationLevel?: 'off' | 'strict' | 'moderate';

  @ApiPropertyOptional({ enum: ['error', 'warn'], default: 'error' })
  @IsOptional()
  @IsEnum(['error', 'warn'])
  validationAction?: 'error' | 'warn';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSchemaDto {
  @ApiPropertyOptional({ description: 'JSON Schema definition' })
  @IsOptional()
  @IsObject()
  jsonSchema?: Record<string, any>;

  @ApiPropertyOptional({ enum: ['off', 'strict', 'moderate'] })
  @IsOptional()
  @IsEnum(['off', 'strict', 'moderate'])
  validationLevel?: 'off' | 'strict' | 'moderate';

  @ApiPropertyOptional({ enum: ['error', 'warn'] })
  @IsOptional()
  @IsEnum(['error', 'warn'])
  validationAction?: 'error' | 'warn';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Comment for this schema update' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ValidateDocumentDto {
  @ApiProperty({ description: 'Document to validate against schema' })
  @IsObject()
  document: Record<string, any>;
}

export class GenerateSchemaDto {
  @ApiProperty({ description: 'Sample documents to infer schema from' })
  @IsObject({ each: true })
  sampleDocuments: Record<string, any>[];

  @ApiPropertyOptional({ description: 'Make all fields required', default: false })
  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}




