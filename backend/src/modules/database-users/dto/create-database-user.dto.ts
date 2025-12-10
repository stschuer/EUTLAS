import { IsString, IsArray, IsOptional, MinLength, MaxLength, Matches, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RoleAssignmentDto {
  @ApiProperty({ 
    enum: ['read', 'readWrite', 'dbAdmin', 'dbOwner', 'userAdmin', 'clusterAdmin', 'readAnyDatabase', 'readWriteAnyDatabase', 'root'],
    example: 'readWrite'
  })
  @IsEnum(['read', 'readWrite', 'dbAdmin', 'dbOwner', 'userAdmin', 'clusterAdmin', 'readAnyDatabase', 'readWriteAnyDatabase', 'userAdminAnyDatabase', 'dbAdminAnyDatabase', 'root'])
  role: string;

  @ApiProperty({ example: 'myDatabase', description: 'Database name, use "admin" for cluster-wide roles' })
  @IsString()
  db: string;
}

export class CreateDatabaseUserDto {
  @ApiProperty({ example: 'app_user', description: 'Username for MongoDB authentication' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
    message: 'Username must start with a letter and contain only letters, numbers, underscores, and hyphens',
  })
  username: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Password for MongoDB authentication' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiProperty({ 
    type: [RoleAssignmentDto],
    example: [{ role: 'readWrite', db: 'myDatabase' }]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles: RoleAssignmentDto[];

  @ApiProperty({ required: false, example: ['myDatabase'], description: 'Restrict access to specific databases' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}


