import { IsString, IsEnum, IsOptional, IsObject, IsArray, IsBoolean, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePrivateNetworkDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['fsn1', 'nbg1', 'hel1'], description: 'Hetzner region' })
  @IsEnum(['fsn1', 'nbg1', 'hel1'])
  region: 'fsn1' | 'nbg1' | 'hel1';

  @ApiProperty({ description: 'IP range in CIDR notation, e.g., 10.0.0.0/16' })
  @IsString()
  @Matches(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, { message: 'Invalid CIDR notation' })
  ipRange: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;
}

export class UpdatePrivateNetworkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;
}

export class CreateSubnetDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Subnet IP range in CIDR notation' })
  @IsString()
  @Matches(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/)
  ipRange: string;

  @ApiProperty({ description: 'Availability zone' })
  @IsString()
  zone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gateway?: string;
}

export class CreatePeeringDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'ID of the network to peer with' })
  @IsString()
  peerNetworkId: string;

  @ApiProperty({ description: 'IP range of the peer network' })
  @IsString()
  @Matches(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/)
  peerIpRange: string;
}

export class AttachClusterDto {
  @ApiProperty()
  @IsString()
  clusterId: string;

  @ApiPropertyOptional({ description: 'Specific private IP to assign' })
  @IsOptional()
  @IsString()
  privateIp?: string;
}

export class UpdateClusterEndpointDto {
  @ApiPropertyOptional({ enum: ['public', 'private', 'both'] })
  @IsOptional()
  @IsEnum(['public', 'private', 'both'])
  endpointType?: 'public' | 'private' | 'both';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicEndpointEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  privateEndpointEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['TLS1.0', 'TLS1.1', 'TLS1.2', 'TLS1.3'] })
  @IsOptional()
  @IsEnum(['TLS1.0', 'TLS1.1', 'TLS1.2', 'TLS1.3'])
  minTlsVersion?: string;
}



