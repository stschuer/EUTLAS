import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Organization, OrganizationDocument } from '../orgs/schemas/org.schema';
import { OrgMember, OrgMemberDocument } from '../orgs/schemas/org-member.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Cluster, ClusterDocument } from '../clusters/schemas/cluster.schema';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  AddUserToTenantDto,
  UpdateTenantMemberDto,
  TenantMemberResponseDto,
  AdminStatsDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(OrgMember.name) private orgMemberModel: Model<OrgMemberDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
  ) {}

  // ============ Stats ============

  async getStats(): Promise<AdminStatsDto> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      activeUsers,
      globalAdmins,
      totalTenants,
      totalProjects,
      totalClusters,
      newUsersLast30Days,
      newTenantsLast30Days,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ isActive: true }),
      this.userModel.countDocuments({ isGlobalAdmin: true }),
      this.orgModel.countDocuments(),
      this.projectModel.countDocuments(),
      this.clusterModel.countDocuments(),
      this.userModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      this.orgModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      globalAdmins,
      totalTenants,
      totalProjects,
      totalClusters,
      newUsersLast30Days,
      newTenantsLast30Days,
    };
  }

  // ============ Tenant (Organization) Management ============

  async listTenants(page = 1, limit = 20, search?: string): Promise<{ tenants: TenantResponseDto[]; total: number; pages: number }> {
    const query: any = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      this.orgModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.orgModel.countDocuments(query),
    ]);

    const tenantResponses = await Promise.all(
      tenants.map(async (tenant) => this.enrichTenantResponse(tenant)),
    );

    return {
      tenants: tenantResponses,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async getTenant(tenantId: string): Promise<TenantResponseDto> {
    const tenant = await this.orgModel.findById(tenantId).lean();
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return this.enrichTenantResponse(tenant);
  }

  async createTenant(dto: CreateTenantDto): Promise<TenantResponseDto> {
    // Find or create owner
    let owner = await this.userModel.findOne({ email: dto.ownerEmail.toLowerCase() }).lean();
    
    if (!owner) {
      throw new NotFoundException(`User with email ${dto.ownerEmail} not found. Create the user first.`);
    }

    // Generate slug if not provided
    const slug = dto.slug || this.generateSlug(dto.name);

    // Check if slug is unique
    const existing = await this.orgModel.findOne({ slug }).lean();
    if (existing) {
      throw new ConflictException(`Tenant with slug "${slug}" already exists`);
    }

    // Create tenant
    const tenant = await this.orgModel.create({
      name: dto.name,
      slug,
      ownerId: owner._id,
    });

    // Add owner as OWNER member
    await this.orgMemberModel.create({
      orgId: tenant._id,
      userId: owner._id,
      role: 'OWNER',
    });

    return this.enrichTenantResponse(tenant.toObject());
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto): Promise<TenantResponseDto> {
    const tenant = await this.orgModel.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.name) {
      tenant.name = dto.name;
    }

    if (dto.ownerEmail) {
      const newOwner = await this.userModel.findOne({ email: dto.ownerEmail.toLowerCase() }).lean();
      if (!newOwner) {
        throw new NotFoundException(`User with email ${dto.ownerEmail} not found`);
      }
      
      // Update owner
      const oldOwnerId = tenant.ownerId;
      tenant.ownerId = newOwner._id as Types.ObjectId;

      // Update org member roles
      await this.orgMemberModel.updateOne(
        { orgId: tenant._id, userId: oldOwnerId },
        { role: 'ADMIN' },
      );

      // Check if new owner is already a member
      const existingMember = await this.orgMemberModel.findOne({
        orgId: tenant._id,
        userId: newOwner._id,
      });

      if (existingMember) {
        existingMember.role = 'OWNER';
        await existingMember.save();
      } else {
        await this.orgMemberModel.create({
          orgId: tenant._id,
          userId: newOwner._id,
          role: 'OWNER',
        });
      }
    }

    await tenant.save();
    return this.enrichTenantResponse(tenant.toObject());
  }

  async deleteTenant(tenantId: string): Promise<void> {
    const tenant = await this.orgModel.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check for active clusters
    const activeClusterCount = await this.clusterModel.countDocuments({
      organizationId: tenantId,
      status: { $nin: ['deleted', 'terminated'] },
    });

    if (activeClusterCount > 0) {
      throw new BadRequestException(
        `Cannot delete tenant with ${activeClusterCount} active cluster(s). Please delete clusters first.`,
      );
    }

    // Delete all related data
    await Promise.all([
      this.orgMemberModel.deleteMany({ orgId: tenantId }),
      this.projectModel.deleteMany({ organizationId: tenantId }),
      this.clusterModel.deleteMany({ organizationId: tenantId }),
    ]);

    await tenant.deleteOne();
  }

  // ============ Tenant Members ============

  async listTenantMembers(tenantId: string): Promise<TenantMemberResponseDto[]> {
    const tenant = await this.orgModel.findById(tenantId).lean();
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const members = await this.orgMemberModel
      .find({ orgId: tenantId })
      .populate('userId', 'email name')
      .lean();

    return members.map((member) => ({
      id: member._id.toString(),
      userId: member.userId._id?.toString() || member.userId.toString(),
      email: (member.userId as any).email || '',
      name: (member.userId as any).name || undefined,
      role: member.role,
      createdAt: member.createdAt,
    }));
  }

  async addUserToTenant(tenantId: string, dto: AddUserToTenantDto): Promise<TenantMemberResponseDto> {
    const tenant = await this.orgModel.findById(tenantId).lean();
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const user = await this.userModel.findOne({ email: dto.userEmail.toLowerCase() }).lean();
    if (!user) {
      throw new NotFoundException(`User with email ${dto.userEmail} not found`);
    }

    // Check if already a member
    const existingMember = await this.orgMemberModel.findOne({
      orgId: tenantId,
      userId: user._id,
    }).lean();

    if (existingMember) {
      throw new ConflictException('User is already a member of this tenant');
    }

    const member = await this.orgMemberModel.create({
      orgId: tenantId,
      userId: user._id,
      role: dto.role,
    });

    return {
      id: member._id.toString(),
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: member.role,
      createdAt: member.createdAt,
    };
  }

  async updateTenantMember(
    tenantId: string,
    userId: string,
    dto: UpdateTenantMemberDto,
  ): Promise<TenantMemberResponseDto> {
    const member = await this.orgMemberModel.findOne({
      orgId: tenantId,
      userId,
    }).populate('userId', 'email name');

    if (!member) {
      throw new NotFoundException('Member not found in this tenant');
    }

    member.role = dto.role;
    await member.save();

    return {
      id: member._id.toString(),
      userId: member.userId._id?.toString() || member.userId.toString(),
      email: (member.userId as any).email || '',
      name: (member.userId as any).name || undefined,
      role: member.role,
      createdAt: member.createdAt,
    };
  }

  async removeUserFromTenant(tenantId: string, userId: string): Promise<void> {
    const member = await this.orgMemberModel.findOne({
      orgId: tenantId,
      userId,
    }).lean();

    if (!member) {
      throw new NotFoundException('Member not found in this tenant');
    }

    if (member.role === 'OWNER') {
      throw new BadRequestException('Cannot remove the owner. Transfer ownership first.');
    }

    await this.orgMemberModel.deleteOne({ _id: member._id });
  }

  // ============ User Management ============

  async listUsers(page = 1, limit = 20, search?: string): Promise<{ users: UserResponseDto[]; total: number; pages: number }> {
    const query: any = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    const userResponses = await Promise.all(
      users.map(async (user) => this.enrichUserResponse(user)),
    );

    return {
      users: userResponses,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async getUser(userId: string): Promise<UserResponseDto> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.enrichUserResponse(user);
  }

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    // Check if email already exists
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      name: dto.name,
      isGlobalAdmin: dto.isGlobalAdmin || false,
      verified: dto.verified !== undefined ? dto.verified : true, // Admin-created users are verified by default
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return this.enrichUserResponse(user.toObject());
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email) {
      const existingWithEmail = await this.userModel.findOne({
        email: dto.email.toLowerCase(),
        _id: { $ne: userId },
      }).lean();
      if (existingWithEmail) {
        throw new ConflictException('Email is already in use by another user');
      }
      user.email = dto.email.toLowerCase();
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.isGlobalAdmin !== undefined) user.isGlobalAdmin = dto.isGlobalAdmin;
    if (dto.verified !== undefined) user.verified = dto.verified;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    await user.save();
    return this.enrichUserResponse(user.toObject());
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user owns any tenants
    const ownedTenants = await this.orgModel.countDocuments({ ownerId: userId });
    if (ownedTenants > 0) {
      throw new BadRequestException(
        `Cannot delete user who owns ${ownedTenants} tenant(s). Transfer ownership first.`,
      );
    }

    // Remove from all tenant memberships
    await this.orgMemberModel.deleteMany({ userId });

    await user.deleteOne();
  }

  async getUserTenants(userId: string): Promise<TenantResponseDto[]> {
    const memberships = await this.orgMemberModel.find({ userId }).lean();
    const tenantIds = memberships.map((m) => m.orgId);
    const tenants = await this.orgModel.find({ _id: { $in: tenantIds } }).lean();

    return Promise.all(tenants.map((t) => this.enrichTenantResponse(t)));
  }

  // ============ Helpers ============

  private async enrichTenantResponse(tenant: any): Promise<TenantResponseDto> {
    const [owner, memberCount, projectCount, clusterCount] = await Promise.all([
      this.userModel.findById(tenant.ownerId).select('email name').lean(),
      this.orgMemberModel.countDocuments({ orgId: tenant._id }),
      this.projectModel.countDocuments({ organizationId: tenant._id }),
      this.clusterModel.countDocuments({ organizationId: tenant._id }),
    ]);

    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      ownerId: tenant.ownerId.toString(),
      ownerEmail: owner?.email,
      ownerName: owner?.name,
      memberCount,
      projectCount,
      clusterCount,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  private async enrichUserResponse(user: any): Promise<UserResponseDto> {
    const tenantCount = await this.orgMemberModel.countDocuments({ userId: user._id });

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      verified: user.verified || false,
      isGlobalAdmin: user.isGlobalAdmin || false,
      isActive: user.isActive !== false,
      lastLoginAt: user.lastLoginAt,
      tenantCount,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 50);
  }
}

