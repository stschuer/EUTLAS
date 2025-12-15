import { IsString, IsArray, IsOptional, IsBoolean, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RoleAssignmentDto } from './create-database-user.dto';

export class UpdateDatabaseUserDto {
  @ApiProperty({ required: false, example: 'NewPassword123!', description: 'New password (optional)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  @ApiProperty({ required: false, type: [RoleAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];

  @ApiProperty({ required: false, example: ['myDatabase'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiProperty({ required: false, example: true, description: 'Enable/disable user' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}





