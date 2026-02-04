import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateClusterDto {
  @ApiPropertyOptional({ 
    example: 'production-db',
    description: 'New name for the cluster' 
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Cluster name must be at least 2 characters' })
  @MaxLength(63, { message: 'Cluster name must be at most 63 characters' })
  @Matches(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
    message: 'Cluster name must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number',
  })
  name?: string;
}
