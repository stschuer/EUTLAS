import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImpersonateUserDto {
  @ApiProperty({
    description: 'The ID of the user to impersonate',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class ImpersonationResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Impersonation details' })
  data: {
    accessToken: string;
    expiresIn: number;
    user: {
      id: string;
      email: string;
      name?: string;
      verified: boolean;
    };
    impersonatedBy: {
      id: string;
      email: string;
      name?: string;
    };
  };
}
