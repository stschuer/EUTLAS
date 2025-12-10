import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { OrgsService } from './orgs.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

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
  @ApiOperation({ summary: 'Delete organization' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);
    await this.orgsService.delete(orgId);
    return {
      success: true,
      message: 'Organization deleted successfully',
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

