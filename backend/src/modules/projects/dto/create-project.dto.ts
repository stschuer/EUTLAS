import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Production' })
  @IsString()
  @MinLength(2, { message: 'Project name must be at least 2 characters' })
  @MaxLength(50, { message: 'Project name must be at most 50 characters' })
  name: string;

  @ApiPropertyOptional({ example: 'Production environment for our main application' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Description must be at most 200 characters' })
  description?: string;
}




