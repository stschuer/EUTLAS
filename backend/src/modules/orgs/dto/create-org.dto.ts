import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrgDto {
  @ApiProperty({ example: 'My Company' })
  @IsString()
  @MinLength(2, { message: 'Organization name must be at least 2 characters' })
  @MaxLength(50, { message: 'Organization name must be at most 50 characters' })
  name: string;
}




