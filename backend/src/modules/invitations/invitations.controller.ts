import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { InvitationsService } from './invitations.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateInvitationDto, AcceptInvitationDto, ResendInvitationDto } from './dto/create-invitation.dto';

@ApiTags('Invitations')
@Controller()
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post('orgs/:orgId/invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invite a user to an organization' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateInvitationDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invitation = await this.invitationsService.create(
      orgId,
      user.userId,
      createDto,
    );

    return {
      success: true,
      data: invitation,
      message: `Invitation sent to ${createDto.email}`,
    };
  }

  @Get('orgs/:orgId/invitations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all invitations for an organization' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invitations = await this.invitationsService.findByOrg(orgId);

    return {
      success: true,
      data: invitations,
    };
  }

  @Get('orgs/:orgId/invitations/pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List pending invitations for an organization' })
  async findPending(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invitations = await this.invitationsService.findByOrg(orgId, 'pending');

    return {
      success: true,
      data: invitations,
    };
  }

  @Post('orgs/:orgId/invitations/:invitationId/resend')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Resend an invitation' })
  async resend(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
    @Body() resendDto: ResendInvitationDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invitation = await this.invitationsService.findById(invitationId);
    if (!invitation || invitation.orgId.toString() !== orgId) {
      throw new NotFoundException('Invitation not found');
    }

    const updated = await this.invitationsService.resend(
      invitationId,
      user.userId,
      resendDto.message,
    );

    return {
      success: true,
      data: updated,
      message: 'Invitation resent',
    };
  }

  @Delete('orgs/:orgId/invitations/:invitationId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke an invitation' })
  async revoke(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invitation = await this.invitationsService.findById(invitationId);
    if (!invitation || invitation.orgId.toString() !== orgId) {
      throw new NotFoundException('Invitation not found');
    }

    await this.invitationsService.revoke(invitationId, user.userId);

    return {
      success: true,
      message: 'Invitation revoked',
    };
  }

  @Get('invitations/mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my pending invitations' })
  async getMyInvitations(@CurrentUser() user: CurrentUserData) {
    const invitations = await this.invitationsService.getMyInvitations(user.email);

    return {
      success: true,
      data: invitations,
    };
  }

  @Post('invitations/accept')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Accept an invitation' })
  async accept(
    @CurrentUser() user: CurrentUserData,
    @Body() acceptDto: AcceptInvitationDto,
  ) {
    const result = await this.invitationsService.accept(acceptDto.token, user.userId);

    return {
      success: true,
      data: result,
      message: 'You have joined the organization',
    };
  }

  @Get('invitations/preview/:token')
  @Public()
  @ApiOperation({ summary: 'Preview an invitation (public)' })
  async preview(@Param('token') token: string) {
    const invitation = await this.invitationsService.findByToken(token);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      return {
        success: false,
        error: {
          code: 'INVITATION_NOT_VALID',
          message: `This invitation has been ${invitation.status}`,
        },
      };
    }

    if (new Date() > invitation.expiresAt) {
      return {
        success: false,
        error: {
          code: 'INVITATION_EXPIRED',
          message: 'This invitation has expired',
        },
      };
    }

    // Return limited info for preview (don't expose sensitive data)
    const org = await this.orgsService.findById(invitation.orgId.toString());

    return {
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        orgName: org?.name,
        message: invitation.message,
        expiresAt: invitation.expiresAt,
      },
    };
  }
}



