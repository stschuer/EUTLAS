import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'verification-token-uuid' })
  @IsString()
  @MinLength(1, { message: 'Token is required' })
  token: string;
}




