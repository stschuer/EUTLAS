import { IsString, MinLength, MaxLength, Matches, IsEnum, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';
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

  // MongoDB version is managed automatically. Native vector search clusters use 8.2+.
  // Field kept for API compatibility but not exposed to users
  @ApiPropertyOptional({ description: 'MongoDB version (defaults to latest stable)' })
  @IsOptional()
  @IsString()
  mongoVersion?: string;

  @ApiPropertyOptional({ enum: ['fsn1', 'nbg1', 'hel1'], example: 'fsn1', description: 'Hetzner region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: false, description: 'Enable native MongoDB Vector Search via MongoDBSearch/mongot (requires MongoDB 8.2+)' })
  @IsOptional()
  @IsBoolean()
  enableVectorSearch?: boolean;

  @ApiPropertyOptional({
    enum: ['single-server', 'multi-site'],
    default: 'single-server',
    description:
      'multi-site (LARGE and above): data members in fsn1 and nbg1 plus an arbiter in fsn1 on separate servers; ' +
      'survives a server or nbg1 outage automatically. Requires TLS clients (mongodb+srv, platform CA).',
  })
  @IsOptional()
  @IsIn(['single-server', 'multi-site'])
  topology?: 'single-server' | 'multi-site';
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

