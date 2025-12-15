import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  MinLength,
  Matches,
} from 'class-validator';

// ============ Tenant DTOs ============

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'acme-corp' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ example: 'owner@acme.com', description: 'Email of the tenant owner' })
  @IsEmail()
  ownerEmail: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Acme Corporation Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'new-owner@acme.com' })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;
}

export class TenantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  ownerId: string;

  @ApiPropertyOptional()
  ownerEmail?: string;

  @ApiPropertyOptional()
  ownerName?: string;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  projectCount: number;

  @ApiProperty()
  clusterCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// ============ User DTOs ============

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
  password: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isGlobalAdmin?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe Updated' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'newemail@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isGlobalAdmin?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'New password (leave empty to keep current)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  isGlobalAdmin: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiProperty()
  tenantCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// ============ Tenant Member DTOs ============

export class AddUserToTenantDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  userEmail: string;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER', 'READONLY'], example: 'MEMBER' })
  @IsEnum(['OWNER', 'ADMIN', 'MEMBER', 'READONLY'])
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';
}

export class UpdateTenantMemberDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER', 'READONLY'] })
  @IsEnum(['OWNER', 'ADMIN', 'MEMBER', 'READONLY'])
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';
}

export class TenantMemberResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  createdAt: Date;
}

// ============ Stats DTOs ============

export class AdminStatsDto {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  globalAdmins: number;

  @ApiProperty()
  totalTenants: number;

  @ApiProperty()
  totalProjects: number;

  @ApiProperty()
  totalClusters: number;

  @ApiProperty()
  newUsersLast30Days: number;

  @ApiProperty()
  newTenantsLast30Days: number;
}



