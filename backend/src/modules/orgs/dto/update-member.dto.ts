import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateMemberDto {
  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Display name of the member'
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Name must not be empty' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name?: string;

  @ApiPropertyOptional({
    example: 'john@example.com',
    description: 'Email address of the member'
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;
}
