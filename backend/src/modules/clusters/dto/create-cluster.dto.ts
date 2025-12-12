import { IsString, MinLength, MaxLength, Matches, IsEnum, IsOptional } from 'class-validator';
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

  @ApiProperty({ enum: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'], example: 'MEDIUM' })
  @IsEnum(['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'], { message: 'Invalid plan selected' })
  plan: 'DEV' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';

  @ApiPropertyOptional({ enum: ['6.0', '7.0'], example: '7.0' })
  @IsOptional()
  @IsEnum(['6.0.0', '7.0.0', '7.0.5'], { message: 'Invalid MongoDB version' })
  mongoVersion?: string;

  @ApiPropertyOptional({ enum: ['fsn1', 'nbg1', 'hel1'], example: 'fsn1', description: 'Hetzner region' })
  @IsOptional()
  @IsString()
  region?: string;
}

