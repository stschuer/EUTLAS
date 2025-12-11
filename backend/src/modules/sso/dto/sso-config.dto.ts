import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SamlConfigDto {
  @ApiProperty({ description: 'Identity Provider SSO URL' })
  @IsString()
  entryPoint: string;

  @ApiProperty({ description: 'Service Provider Entity ID' })
  @IsString()
  issuer: string;

  @ApiProperty({ description: 'IdP X.509 Certificate' })
  @IsString()
  cert: string;

  @ApiPropertyOptional({ description: 'SP Private Key for signing' })
  @IsOptional()
  @IsString()
  privateKey?: string;

  @ApiPropertyOptional({ description: 'SP Certificate' })
  @IsOptional()
  @IsString()
  privateCert?: string;

  @ApiPropertyOptional({ default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress' })
  @IsOptional()
  @IsString()
  identifierFormat?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  wantAssertionsSigned?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  wantAuthnResponseSigned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributeMapping?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
}

export class OidcConfigDto {
  @ApiProperty({ enum: ['google', 'microsoft', 'okta', 'auth0', 'custom'] })
  @IsEnum(['google', 'microsoft', 'okta', 'auth0', 'custom'])
  provider: 'google' | 'microsoft' | 'okta' | 'auth0' | 'custom';

  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiProperty()
  @IsString()
  clientSecret: string;

  @ApiPropertyOptional({ description: 'Required for custom/okta/auth0' })
  @IsOptional()
  @IsString()
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorizationURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tokenURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userInfoURL?: string;

  @ApiPropertyOptional({ default: ['openid', 'email', 'profile'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scope?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributeMapping?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
}

export class CreateSsoConfigDto {
  @ApiProperty({ example: 'Corporate SSO' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ['saml', 'oidc'] })
  @IsEnum(['saml', 'oidc'])
  type: 'saml' | 'oidc';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enforced?: boolean;

  @ApiPropertyOptional({ example: ['company.com', 'corp.company.com'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailDomains?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SamlConfigDto)
  saml?: SamlConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => OidcConfigDto)
  oidc?: OidcConfigDto;

  @ApiPropertyOptional({ description: 'Map IdP groups to EUTLAS roles' })
  @IsOptional()
  @IsObject()
  roleMapping?: {
    [groupName: string]: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';
  };

  @ApiPropertyOptional({ enum: ['OWNER', 'ADMIN', 'MEMBER', 'READONLY'], default: 'MEMBER' })
  @IsOptional()
  @IsEnum(['OWNER', 'ADMIN', 'MEMBER', 'READONLY'])
  defaultRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowJitProvisioning?: boolean;
}

export class UpdateSsoConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enforced?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailDomains?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SamlConfigDto)
  saml?: SamlConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => OidcConfigDto)
  oidc?: OidcConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  roleMapping?: {
    [groupName: string]: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['OWNER', 'ADMIN', 'MEMBER', 'READONLY'])
  defaultRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowJitProvisioning?: boolean;
}



