import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  IsArray,
  IsNumber,
  MinLength,
  MaxLength,
  IsMongoId,
} from 'class-validator';
import { TemplateType, TemplateCategory, TemplateVisibility } from '../schemas/template.schema';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template name', example: 'Production Monitoring Dashboard' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: TemplateType, description: 'Template type' })
  @IsEnum(TemplateType)
  type: TemplateType;

  @ApiProperty({ enum: TemplateCategory, description: 'Template category' })
  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @ApiPropertyOptional({ enum: TemplateVisibility, description: 'Template visibility' })
  @IsEnum(TemplateVisibility)
  @IsOptional()
  visibility?: TemplateVisibility;

  @ApiPropertyOptional({ description: 'Tenant ID (for tenant-specific templates)' })
  @IsMongoId()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Template content (JSON for dashboard/schema templates)' })
  @IsObject()
  @IsOptional()
  content?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Tags for categorization' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Mark as featured' })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: TemplateCategory })
  @IsEnum(TemplateCategory)
  @IsOptional()
  category?: TemplateCategory;

  @ApiPropertyOptional({ enum: TemplateVisibility })
  @IsEnum(TemplateVisibility)
  @IsOptional()
  visibility?: TemplateVisibility;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  content?: Record<string, any>;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class TemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description?: string;

  @ApiProperty({ enum: TemplateType })
  type: TemplateType;

  @ApiProperty({ enum: TemplateCategory })
  category: TemplateCategory;

  @ApiProperty({ enum: TemplateVisibility })
  visibility: TemplateVisibility;

  @ApiPropertyOptional()
  tenantId?: string;

  @ApiProperty()
  createdBy: string;

  @ApiPropertyOptional()
  updatedBy?: string;

  @ApiPropertyOptional()
  content?: Record<string, any>;

  @ApiPropertyOptional()
  fileUrl?: string;

  @ApiPropertyOptional()
  fileName?: string;

  @ApiPropertyOptional()
  fileSize?: number;

  @ApiPropertyOptional()
  mimeType?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isFeatured: boolean;

  @ApiProperty()
  isSystem: boolean;

  @ApiProperty()
  tags: string[];

  @ApiProperty()
  usageCount: number;

  @ApiPropertyOptional()
  previewUrl?: string;

  @ApiPropertyOptional()
  metadata?: Record<string, any>;

  @ApiProperty()
  version: number;

  @ApiPropertyOptional()
  previousVersion?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class QueryTemplatesDto {
  @ApiPropertyOptional({ description: 'Filter by template type' })
  @IsEnum(TemplateType)
  @IsOptional()
  type?: TemplateType;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsEnum(TemplateCategory)
  @IsOptional()
  category?: TemplateCategory;

  @ApiPropertyOptional({ description: 'Filter by visibility' })
  @IsEnum(TemplateVisibility)
  @IsOptional()
  visibility?: TemplateVisibility;

  @ApiPropertyOptional({ description: 'Filter by tenant ID' })
  @IsMongoId()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', default: true })
  @IsBoolean()
  @IsOptional()
  activeOnly?: boolean;

  @ApiPropertyOptional({ description: 'Show only featured templates' })
  @IsBoolean()
  @IsOptional()
  featuredOnly?: boolean;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ description: 'Search query' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsNumber()
  @IsOptional()
  limit?: number;
}
