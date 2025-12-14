import { IsString, IsOptional, IsArray, IsDateString, MaxLength, ArrayMaxSize, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production API Key', description: 'Name for the API key' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, example: 'Used by CI/CD pipeline' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ 
    required: false,
    example: ['clusters:read', 'projects:read', 'metrics:read'],
    description: 'Permissions for this key'
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  scopes?: string[];

  @ApiProperty({ required: false, example: ['192.168.1.0/24'], description: 'IP whitelist' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  allowedIps?: string[];

  @ApiProperty({ required: false, example: '2025-12-31T23:59:59Z', description: 'Expiration date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  scopes?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  allowedIps?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}




