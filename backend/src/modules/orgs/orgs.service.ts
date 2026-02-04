import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/org.schema';
import { OrgMember, OrgMemberDocument, OrgRole } from './schemas/org-member.schema';
import { CreateOrgDto } from './dto/create-org.dto';

@Injectable()
export class OrgsService {
  private readonly logger = new Logger(OrgsService.name);

  constructor(
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(OrgMember.name) private memberModel: Model<OrgMemberDocument>,
    @InjectConnection() private connection: Connection,
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

  /**
   * Delete organization and ALL related data (cascade delete)
   * This is a destructive operation that cannot be undone.
   */
  async delete(orgId: string, force: boolean = false): Promise<{ deletedCounts: Record<string, number> }> {
    const org = await this.findById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Check for active clusters unless force=true
    if (!force) {
      const activeClusters = await this.connection.collection('clusters').countDocuments({
        orgId: org._id,
        status: { $nin: ['deleting', 'failed'] },
      });
      
      if (activeClusters > 0) {
        throw new BadRequestException({
          code: 'ACTIVE_CLUSTERS_EXIST',
          message: `Cannot delete organization with ${activeClusters} active cluster(s). Delete clusters first or use force=true.`,
        });
      }
    }

    this.logger.log(`Starting cascade delete for org ${orgId} (${org.name})`);
    const deletedCounts: Record<string, number> = {};

    // Collections that reference orgId directly
    const orgIdCollections = [
      'orgmembers',
      'projects',
      'clusters',
      'invitations',
      'apikeys',
      'alertrules',
      'alerthistories',
      'notificationchannels',
      'billingaccounts',
      'invoices',
      'usagerecords',
      'ssoconfigs',
      'events',
      'auditlogs',
      'dashboards',
      'scalingrecommendations',
    ];

    // Get all project IDs and cluster IDs for this org first
    const projects = await this.connection.collection('projects').find({ orgId: org._id }).toArray();
    const projectIds = projects.map(p => p._id);
    
    const clusters = await this.connection.collection('clusters').find({ orgId: org._id }).toArray();
    const clusterIds = clusters.map(c => c._id);

    this.logger.log(`Found ${projectIds.length} projects and ${clusterIds.length} clusters to delete`);

    // Collections that reference clusterId
    const clusterIdCollections = [
      'backups',
      'backuppolicies',
      'databaseusers',
      'ipwhitelists',
      'searchindexes',
      'vectorindexes',
      'pitrconfigs',
      'pitrrestores',
      'oplogentries',
      'metrics',
      'slowqueries',
      'indexsuggestions',
      'maintenancewindows',
      'logforwardings',
      'archiverules',
      'clusterendpoints',
      'clustersettings',
      'collectionschemas',
    ];

    // Collections that reference projectId
    const projectIdCollections = [
      'privatenetworks',
    ];

    // Delete cluster-related data first
    if (clusterIds.length > 0) {
      for (const collection of clusterIdCollections) {
        try {
          const result = await this.connection.collection(collection).deleteMany({
            clusterId: { $in: clusterIds },
          });
          if (result.deletedCount > 0) {
            deletedCounts[collection] = result.deletedCount;
            this.logger.debug(`Deleted ${result.deletedCount} documents from ${collection}`);
          }
        } catch (err) {
          // Collection might not exist, that's OK
          this.logger.debug(`Collection ${collection} not found or error: ${err.message}`);
        }
      }
    }

    // Delete project-related data
    if (projectIds.length > 0) {
      for (const collection of projectIdCollections) {
        try {
          const result = await this.connection.collection(collection).deleteMany({
            projectId: { $in: projectIds },
          });
          if (result.deletedCount > 0) {
            deletedCounts[collection] = result.deletedCount;
            this.logger.debug(`Deleted ${result.deletedCount} documents from ${collection}`);
          }
        } catch (err) {
          this.logger.debug(`Collection ${collection} not found or error: ${err.message}`);
        }
      }
    }

    // Delete org-level data
    for (const collection of orgIdCollections) {
      try {
        const result = await this.connection.collection(collection).deleteMany({
          orgId: org._id,
        });
        if (result.deletedCount > 0) {
          deletedCounts[collection] = result.deletedCount;
          this.logger.debug(`Deleted ${result.deletedCount} documents from ${collection}`);
        }
      } catch (err) {
        this.logger.debug(`Collection ${collection} not found or error: ${err.message}`);
      }
    }

    // Finally delete the organization itself
    await this.orgModel.findByIdAndDelete(orgId).exec();
    deletedCounts['organizations'] = 1;

    this.logger.log(`Cascade delete complete for org ${orgId}. Summary: ${JSON.stringify(deletedCounts)}`);
    
    return { deletedCounts };
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

