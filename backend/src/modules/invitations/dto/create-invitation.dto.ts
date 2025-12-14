import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({ example: 'newmember@example.com', description: 'Email address to invite' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'READONLY'], default: 'MEMBER', description: 'Role to assign' })
  @IsEnum(['ADMIN', 'MEMBER', 'READONLY'])
  role: 'ADMIN' | 'MEMBER' | 'READONLY';

  @ApiProperty({ required: false, example: 'Welcome to the team!', description: 'Personal message' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ example: 'abc123...', description: 'Invitation token from email' })
  @IsString()
  token: string;
}

export class ResendInvitationDto {
  @ApiProperty({ required: false, example: 'Updated message', description: 'New personal message' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}




