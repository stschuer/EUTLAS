import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { OrgsService } from './orgs.service';
import { UsersService } from '../users/users.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly orgsService: OrgsService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() createOrgDto: CreateOrgDto,
  ) {
    const org = await this.orgsService.create(user.userId, createOrgDto);
    return {
      success: true,
      data: org,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all organizations for current user' })
  async findAll(@CurrentUser() user: CurrentUserData) {
    const orgs = await this.orgsService.findAllByUser(user.userId);
    return {
      success: true,
      data: orgs,
    };
  }

  @Get(':orgId')
  @ApiOperation({ summary: 'Get organization by ID' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);
    const org = await this.orgsService.findById(orgId);
    const role = await this.orgsService.getUserRole(orgId, user.userId);
    
    return {
      success: true,
      data: {
        ...org?.toJSON(),
        userRole: role,
      },
    };
  }

  @Patch(':orgId')
  @ApiOperation({ summary: 'Update organization' })
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() updateOrgDto: UpdateOrgDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    const org = await this.orgsService.update(orgId, updateOrgDto);
    return {
      success: true,
      data: org,
    };
  }

  @Delete(':orgId')
  @ApiOperation({ summary: 'Delete organization and all related data (cascade delete)' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Query('force') force?: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);
    const result = await this.orgsService.delete(orgId, force === 'true');
    return {
      success: true,
      message: 'Organization and all related data deleted successfully',
      data: result,
    };
  }

  @Get(':orgId/members')
  @ApiOperation({ summary: 'Get organization members' })
  async getMembers(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);
    const members = await this.orgsService.getMembers(orgId);
    return {
      success: true,
      data: members,
    };
  }

  @Patch(':orgId/members/:userId')
  @ApiOperation({ summary: 'Update member role' })
  async updateMemberRole(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role: 'ADMIN' | 'MEMBER' | 'READONLY' },
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    // Check target member exists
    const member = await this.orgsService.getMemberByUserId(orgId, targetUserId);
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Prevent changing owner role
    if (member.role === 'OWNER') {
      return {
        success: false,
        error: { code: 'CANNOT_CHANGE_OWNER', message: 'Cannot change owner role' },
      };
    }

    const updated = await this.orgsService.updateMemberRole(orgId, targetUserId, body.role);
    return {
      success: true,
      data: updated,
    };
  }

  @Patch(':orgId/members/:userId/profile')
  @ApiOperation({ summary: 'Update member profile (name, email)' })
  async updateMemberProfile(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('userId') targetUserId: string,
    @Body() updateMemberDto: UpdateMemberDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    // Check target member exists in this org
    const member = await this.orgsService.getMemberByUserId(orgId, targetUserId);
    if (!member) {
      throw new NotFoundException('Member not found in this organization');
    }

    // Update the user profile
    const updatedUser = await this.usersService.adminUpdateUser(targetUserId, {
      name: updateMemberDto.name,
      email: updateMemberDto.email,
    });

    return {
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
    };
  }

  @Delete(':orgId/members/:userId')
  @ApiOperation({ summary: 'Remove member from organization' })
  async removeMember(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('userId') targetUserId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    await this.orgsService.removeMember(orgId, targetUserId);
    return {
      success: true,
      message: 'Member removed',
    };
  }
}

