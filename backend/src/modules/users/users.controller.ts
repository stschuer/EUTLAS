import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: CurrentUserData) {
    const userData = await this.usersService.findById(user.userId);
    return {
      success: true,
      data: {
        id: userData?.id,
        email: userData?.email,
        name: userData?.name,
        verified: userData?.verified,
        createdAt: userData?.createdAt,
      },
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const userData = await this.usersService.updateProfile(
      user.userId,
      updateUserDto,
    );
    return {
      success: true,
      data: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        verified: userData.verified,
      },
    };
  }

  @Post('me/password')
  @ApiOperation({ summary: 'Change password (requires current password)' })
  async changePassword(
    @CurrentUser() user: CurrentUserData,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(
      user.userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  @Delete('me')
  @ApiOperation({ summary: 'Delete account (requires password confirmation)' })
  async deleteAccount(
    @CurrentUser() user: CurrentUserData,
    @Body() deleteAccountDto: DeleteAccountDto,
  ) {
    const result = await this.usersService.deleteAccount(
      user.userId,
      deleteAccountDto.password,
    );
    return {
      success: true,
      message: 'Account deleted successfully',
      data: result,
    };
  }
}





