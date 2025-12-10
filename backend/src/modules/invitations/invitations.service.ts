import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { Invitation, InvitationDocument, InvitationStatus } from './schemas/invitation.schema';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { OrgRole } from '../orgs/schemas/org-member.schema';
import { OrgsService } from '../orgs/orgs.service';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly INVITATION_EXPIRY_DAYS = 7;

  constructor(
    @InjectModel(Invitation.name) private invitationModel: Model<InvitationDocument>,
    private readonly orgsService: OrgsService,
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
    private readonly emailService: EmailService,
  ) {}

  async create(
    orgId: string,
    inviterId: string,
    createDto: CreateInvitationDto,
  ): Promise<Invitation> {
    const email = createDto.email.toLowerCase().trim();

    // Check if user is already a member
    const existingMember = await this.orgsService.findMemberByEmail(orgId, email);
    if (existingMember) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'This user is already a member of the organization',
      });
    }

    // Check for existing pending invitation
    const existingInvitation = await this.invitationModel.findOne({
      orgId,
      email,
      status: 'pending',
    }).exec();

    if (existingInvitation) {
      throw new ConflictException({
        code: 'INVITATION_EXISTS',
        message: 'An invitation has already been sent to this email',
      });
    }

    // Generate secure token
    const token = this.generateToken();

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);

    // Create invitation
    const invitation = new this.invitationModel({
      orgId,
      email,
      role: createDto.role as OrgRole,
      token,
      status: 'pending' as InvitationStatus,
      expiresAt,
      invitedBy: inviterId,
      message: createDto.message,
    });

    await invitation.save();

    // Get org details for email
    const org = await this.orgsService.findById(orgId);
    const inviter = await this.usersService.findById(inviterId);

    // Send invitation email
    try {
      const inviterData = inviter as any;
      await this.emailService.sendInvitationEmail({
        to: email,
        inviterName: inviter ? `${inviterData.firstName || ''} ${inviterData.lastName || ''}`.trim() || 'A team member' : 'A team member',
        orgName: org?.name || 'an organization',
        role: createDto.role,
        token,
        message: createDto.message,
        expiresAt,
      });
    } catch (error: any) {
      this.logger.error(`Failed to send invitation email: ${error.message}`);
      // Don't fail the invitation creation if email fails
    }

    // Log event
    await this.eventsService.createEvent({
      orgId,
      type: 'USER_INVITED',
      severity: 'info',
      message: `Invitation sent to ${email} with role ${createDto.role}`,
      metadata: { email, role: createDto.role, invitedBy: inviterId },
    });

    this.logger.log(`Created invitation for ${email} to org ${orgId}`);
    return invitation;
  }

  async findByOrg(orgId: string, status?: InvitationStatus): Promise<Invitation[]> {
    const query: any = { orgId };
    if (status) {
      query.status = status;
    }
    return this.invitationModel
      .find(query)
      .populate('invitedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(invitationId: string): Promise<InvitationDocument | null> {
    return this.invitationModel.findById(invitationId).exec();
  }

  async findByToken(token: string): Promise<InvitationDocument | null> {
    return this.invitationModel.findOne({ token }).exec();
  }

  async accept(token: string, userId: string): Promise<{ orgId: string; role: OrgRole }> {
    const invitation = await this.findByToken(token);

    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found or has been revoked',
      });
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException({
        code: 'INVITATION_NOT_PENDING',
        message: `Invitation has already been ${invitation.status}`,
      });
    }

    if (new Date() > invitation.expiresAt) {
      // Update status to expired
      invitation.status = 'expired' as InvitationStatus;
      await invitation.save();
      
      throw new BadRequestException({
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired',
      });
    }

    // Check if user is already a member
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.orgsService.findMemberByEmail(
      invitation.orgId.toString(),
      user.email,
    );
    if (existingMember) {
      // Update invitation status
      invitation.status = 'accepted' as InvitationStatus;
      invitation.acceptedBy = user._id;
      invitation.acceptedAt = new Date();
      await invitation.save();

      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'You are already a member of this organization',
      });
    }

    // Add user to organization
    await this.orgsService.addMember(
      invitation.orgId.toString(),
      userId,
      invitation.role,
    );

    // Update invitation
    invitation.status = 'accepted' as InvitationStatus;
    invitation.acceptedBy = user._id;
    invitation.acceptedAt = new Date();
    await invitation.save();

    // Log event
    await this.eventsService.createEvent({
      orgId: invitation.orgId.toString(),
      type: 'USER_JOINED',
      severity: 'info',
      message: `${user.email} joined the organization`,
      metadata: { userId, email: user.email, role: invitation.role },
    });

    this.logger.log(`User ${userId} accepted invitation to org ${invitation.orgId}`);

    return {
      orgId: invitation.orgId.toString(),
      role: invitation.role,
    };
  }

  async revoke(invitationId: string, revokerId: string): Promise<void> {
    const invitation = await this.findById(invitationId);
    
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException({
        code: 'CANNOT_REVOKE',
        message: `Cannot revoke an invitation that is ${invitation.status}`,
      });
    }

    invitation.status = 'revoked' as InvitationStatus;
    await invitation.save();

    // Log event
    await this.eventsService.createEvent({
      orgId: invitation.orgId.toString(),
      type: 'USER_REMOVED',
      severity: 'info',
      message: `Invitation to ${invitation.email} was revoked`,
      metadata: { email: invitation.email, revokedBy: revokerId },
    });

    this.logger.log(`Invitation ${invitationId} revoked by ${revokerId}`);
  }

  async resend(invitationId: string, resenderId: string, message?: string): Promise<Invitation> {
    const invitation = await this.findById(invitationId);
    
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException({
        code: 'CANNOT_RESEND',
        message: `Cannot resend an invitation that is ${invitation.status}`,
      });
    }

    // Generate new token and extend expiry
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);

    invitation.token = token;
    invitation.expiresAt = expiresAt;
    if (message !== undefined) {
      invitation.message = message;
    }
    await invitation.save();

    // Get org details for email
    const org = await this.orgsService.findById(invitation.orgId.toString());
    const resender = await this.usersService.findById(resenderId);

    // Send invitation email
    try {
      const resenderData = resender as any;
      await this.emailService.sendInvitationEmail({
        to: invitation.email,
        inviterName: resender ? `${resenderData.firstName || ''} ${resenderData.lastName || ''}`.trim() || 'A team member' : 'A team member',
        orgName: org?.name || 'an organization',
        role: invitation.role,
        token,
        message: invitation.message,
        expiresAt,
      });
    } catch (error: any) {
      this.logger.error(`Failed to resend invitation email: ${error.message}`);
    }

    this.logger.log(`Resent invitation ${invitationId}`);
    return invitation;
  }

  async getMyInvitations(email: string): Promise<Invitation[]> {
    return this.invitationModel
      .find({
        email: email.toLowerCase(),
        status: 'pending',
        expiresAt: { $gt: new Date() },
      })
      .populate('orgId', 'name slug')
      .sort({ createdAt: -1 })
      .exec();
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}

