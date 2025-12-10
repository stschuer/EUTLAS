import { IsString, IsOptional, IsBoolean, IsDateString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateIpWhitelistDto {
  @ApiProperty({ 
    example: '192.168.1.0/24', 
    description: 'CIDR block to whitelist. Use 0.0.0.0/0 to allow all IPs.' 
  })
  @IsString()
  @Matches(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, {
    message: 'Invalid CIDR format. Use format like 192.168.1.0/24 or 0.0.0.0/0',
  })
  cidrBlock: string;

  @ApiProperty({ required: false, example: 'Office Network', description: 'Description of this IP range' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  comment?: string;

  @ApiProperty({ required: false, default: false, description: 'Whether this is temporary access' })
  @IsOptional()
  @IsBoolean()
  isTemporary?: boolean;

  @ApiProperty({ required: false, example: '2024-12-31T23:59:59Z', description: 'Expiration date for temporary access' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}


