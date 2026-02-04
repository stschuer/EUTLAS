import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/org.schema';
import { OrgMember, OrgMemberDocument, OrgRole } from './schemas/org-member.schema';
import { CreateOrgDto } from './dto/create-org.dto';

@Injectable()
export class OrgsService {
  constructor(
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(OrgMember.name) private memberModel: Model<OrgMemberDocument>,
  ) {}

  async create(userId: string, createOrgDto: CreateOrgDto): Promise<Organization> {
    const slug = this.generateSlug(createOrgDto.name);
    
    // Check if slug exists
    const existingOrg = await this.orgModel.findOne({ slug }).exec();
    if (existingOrg) {
      throw new ConflictException({
        code: 'SLUG_EXISTS',
        message: 'An organization with a similar name already exists',
      });
    }

    // Create org
    const org = new this.orgModel({
      name: createOrgDto.name,
      slug,
      ownerId: userId,
    });
    await org.save();

    // Add creator as owner
    const member = new this.memberModel({
      orgId: org.id,
      userId,
      role: 'OWNER' as OrgRole,
    });
    await member.save();

    return org;
  }

  async findAllByUser(userId: string): Promise<Organization[]> {
    const memberships = await this.memberModel.find({ userId }).exec();
    const orgIds = memberships.map((m) => m.orgId);
    return this.orgModel.find({ _id: { $in: orgIds } }).exec();
  }

  async findById(orgId: string): Promise<OrganizationDocument | null> {
    return this.orgModel.findById(orgId).exec();
  }

  async findBySlug(slug: string): Promise<OrganizationDocument | null> {
    return this.orgModel.findOne({ slug }).exec();
  }

  async getUserRole(orgId: string, userId: string): Promise<OrgRole | null> {
    const membership = await this.memberModel.findOne({ orgId, userId }).exec();
    return membership?.role || null;
  }

  async checkAccess(
    orgId: string,
    userId: string,
    requiredRoles: OrgRole[] = [],
  ): Promise<OrgRole> {
    const role = await this.getUserRole(orgId, userId);
    
    if (!role) {
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'You are not a member of this organization',
      });
    }

    if (requiredRoles.length > 0 && !this.hasRequiredRole(role, requiredRoles)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have sufficient permissions',
      });
    }

    return role;
  }

  async getMembers(orgId: string): Promise<OrgMember[]> {
    return this.memberModel
      .find({ orgId })
      .populate('userId', 'name email')
      .exec();
  }

  async findMemberByEmail(orgId: string, email: string): Promise<OrgMember | null> {
    // This requires a join with users collection
    // For now, we'll do a two-step lookup
    const members = await this.memberModel
      .find({ orgId })
      .populate('userId', 'email')
      .exec();

    const member = members.find((m: any) => {
      const user = m.userId as any;
      return user?.email?.toLowerCase() === email.toLowerCase();
    });

    return member || null;
  }

  async getMemberByUserId(orgId: string, userId: string): Promise<OrgMember | null> {
    return this.memberModel.findOne({ orgId, userId }).exec();
  }

  async addMember(
    orgId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrgMember> {
    const existingMember = await this.memberModel.findOne({ orgId, userId }).exec();
    if (existingMember) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'User is already a member of this organization',
      });
    }

    const member = new this.memberModel({ orgId, userId, role });
    return member.save();
  }

  async updateMemberRole(
    orgId: string,
    userId: string,
    newRole: OrgRole,
  ): Promise<OrgMember> {
    const member = await this.memberModel.findOneAndUpdate(
      { orgId, userId },
      { role: newRole },
      { new: true },
    ).exec();

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    const org = await this.findById(orgId);
    if (org?.ownerId.toString() === userId) {
      throw new ForbiddenException({
        code: 'CANNOT_REMOVE_OWNER',
        message: 'Cannot remove the organization owner',
      });
    }

    await this.memberModel.deleteOne({ orgId, userId }).exec();
  }

  async update(
    orgId: string,
    data: { name?: string },
  ): Promise<OrganizationDocument> {
    const updateData: any = { ...data };
    if (data.name) {
      updateData.slug = this.generateSlug(data.name);
    }

    const org = await this.orgModel.findByIdAndUpdate(
      orgId,
      { $set: updateData },
      { new: true },
    ).exec();

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async delete(orgId: string): Promise<void> {
    // TODO: Check for active clusters before deletion
    await this.memberModel.deleteMany({ orgId }).exec();
    await this.orgModel.findByIdAndDelete(orgId).exec();
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  private hasRequiredRole(userRole: OrgRole, requiredRoles: OrgRole[]): boolean {
    const roleHierarchy: Record<OrgRole, number> = {
      OWNER: 4,
      ADMIN: 3,
      MEMBER: 2,
      READONLY: 1,
    };

    const userLevel = roleHierarchy[userRole];
    return requiredRoles.some((role) => userLevel >= roleHierarchy[role]);
  }
}

