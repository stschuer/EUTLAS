import { IsString, MinLength, MaxLength, Matches, IsEnum, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClusterDto {
  @ApiProperty({ example: 'my-cluster-01' })
  @IsString()
  @MinLength(3, { message: 'Cluster name must be at least 3 characters' })
  @MaxLength(30, { message: 'Cluster name must be at most 30 characters' })
  @Matches(
    /^[a-z][a-z0-9-]*[a-z0-9]$/,
    { message: 'Cluster name must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number' },
  )
  name: string;

  @ApiProperty({ enum: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'], example: 'MEDIUM' })
  @IsEnum(['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'], { message: 'Invalid plan selected' })
  plan: 'DEV' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | 'XXL' | 'XXXL' | 'DEDICATED_L' | 'DEDICATED_XL';

  // MongoDB version is managed automatically - always uses latest stable (7.0.5)
  // Field kept for API compatibility but not exposed to users
  @ApiPropertyOptional({ description: 'MongoDB version (defaults to latest stable)' })
  @IsOptional()
  @IsString()
  mongoVersion?: string;

  @ApiPropertyOptional({ enum: ['fsn1', 'nbg1', 'hel1'], example: 'fsn1', description: 'Hetzner region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: false, description: 'Enable Qdrant vector search companion service' })
  @IsOptional()
  @IsBoolean()
  enableVectorSearch?: boolean;
}

export class CloneClusterDto {
  @ApiProperty({ example: 'cloned-cluster' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetProjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plan?: string;
}

