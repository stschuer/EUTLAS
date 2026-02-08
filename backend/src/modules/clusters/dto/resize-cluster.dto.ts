import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResizeClusterDto {
  @ApiProperty({ enum: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'], example: 'LARGE' })
  @IsEnum(['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL'], { message: 'Invalid plan selected' })
  plan: 'DEV' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | 'XXL' | 'XXXL' | 'DEDICATED_L' | 'DEDICATED_XL';
}





