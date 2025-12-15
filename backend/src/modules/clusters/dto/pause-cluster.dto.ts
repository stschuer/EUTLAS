import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PauseClusterDto {
  @ApiProperty({ required: false, example: 'Cost saving during off-hours' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ResumeClusterDto {
  @ApiProperty({ required: false, example: 'Resuming for development' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}





