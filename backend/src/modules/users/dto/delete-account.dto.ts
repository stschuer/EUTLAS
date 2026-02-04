import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ description: 'Your current password to confirm deletion' })
  @IsString()
  password: string;
}
