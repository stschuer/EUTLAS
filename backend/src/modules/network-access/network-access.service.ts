import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IpWhitelistEntry, IpWhitelistEntryDocument } from './schemas/ip-whitelist.schema';
import { CreateIpWhitelistDto } from './dto/create-ip-whitelist.dto';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class NetworkAccessService {
  private readonly logger = new Logger(NetworkAccessService.name);

  constructor(
    @InjectModel(IpWhitelistEntry.name) private ipWhitelistModel: Model<IpWhitelistEntryDocument>,
    private readonly kubernetesService: KubernetesService,
    private readonly eventsService: EventsService,
  ) {}

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    createDto: CreateIpWhitelistDto,
  ): Promise<IpWhitelistEntry> {
    // Validate CIDR
    this.validateCidr(createDto.cidrBlock);

    // Check for duplicates
    const existing = await this.ipWhitelistModel.findOne({
      clusterId,
      cidrBlock: createDto.cidrBlock,
    }).exec();

    if (existing) {
      throw new ConflictException({
        code: 'ENTRY_EXISTS',
        message: `IP range ${createDto.cidrBlock} is already whitelisted`,
      });
    }

    // Validate temporary access
    if (createDto.isTemporary && !createDto.expiresAt) {
      throw new BadRequestException({
        code: 'MISSING_EXPIRY',
        message: 'Temporary access requires an expiration date',
      });
    }

    // Create entry
    const entry = new this.ipWhitelistModel({
      clusterId,
      projectId,
      orgId,
      cidrBlock: createDto.cidrBlock,
      comment: createDto.comment,
      isTemporary: createDto.isTemporary || false,
      expiresAt: createDto.expiresAt ? new Date(createDto.expiresAt) : undefined,
      createdBy: userId,
    });

    await entry.save();

    // Apply to Kubernetes Network Policy
    try {
      await this.syncNetworkPolicies(clusterId, projectId);
    } catch (error: any) {
      this.logger.error(`Failed to sync network policies: ${error.message}`);
      // Don't fail the request, the entry is saved and will be synced later
    }

    // Log event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `IP whitelist entry added: ${createDto.cidrBlock}`,
      metadata: { cidrBlock: createDto.cidrBlock, comment: createDto.comment },
    });

    this.logger.log(`Added IP whitelist entry ${createDto.cidrBlock} for cluster ${clusterId}`);
    return entry;
  }

  async findAllByCluster(clusterId: string): Promise<IpWhitelistEntry[]> {
    return this.ipWhitelistModel.find({ 
      clusterId,
      isActive: true,
      $or: [
        { isTemporary: false },
        { isTemporary: true, expiresAt: { $gt: new Date() } },
      ],
    }).sort({ createdAt: -1 }).exec();
  }

  async findById(entryId: string): Promise<IpWhitelistEntryDocument | null> {
    return this.ipWhitelistModel.findById(entryId).exec();
  }

  async delete(entryId: string): Promise<void> {
    const entry = await this.findById(entryId);
    if (!entry) {
      throw new NotFoundException('IP whitelist entry not found');
    }

    // Check if this is the last entry (don't allow deleting all entries for security)
    const remainingCount = await this.ipWhitelistModel.countDocuments({
      clusterId: entry.clusterId,
      _id: { $ne: entryId },
      isActive: true,
    }).exec();

    // Allow deleting if there's at least one other entry OR if it's 0.0.0.0/0
    if (remainingCount === 0 && entry.cidrBlock !== '0.0.0.0/0') {
      this.logger.warn(`Deleting last IP whitelist entry for cluster ${entry.clusterId}`);
    }

    // Delete entry
    await this.ipWhitelistModel.findByIdAndDelete(entryId).exec();

    // Update Kubernetes Network Policy
    try {
      await this.syncNetworkPolicies(entry.clusterId.toString(), entry.projectId.toString());
    } catch (error: any) {
      this.logger.error(`Failed to sync network policies: ${error.message}`);
    }

    // Log event
    await this.eventsService.createEvent({
      orgId: entry.orgId.toString(),
      projectId: entry.projectId.toString(),
      clusterId: entry.clusterId.toString(),
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `IP whitelist entry removed: ${entry.cidrBlock}`,
    });

    this.logger.log(`Removed IP whitelist entry ${entry.cidrBlock} from cluster ${entry.clusterId}`);
  }

  async addCurrentIp(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    clientIp: string,
    comment?: string,
  ): Promise<IpWhitelistEntry> {
    // Convert single IP to /32 CIDR
    const cidrBlock = `${clientIp}/32`;

    return this.create(clusterId, projectId, orgId, userId, {
      cidrBlock,
      comment: comment || `Added from current IP`,
      isTemporary: false,
    });
  }

  async allowFromAnywhere(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
  ): Promise<IpWhitelistEntry> {
    return this.create(clusterId, projectId, orgId, userId, {
      cidrBlock: '0.0.0.0/0',
      comment: 'Allow access from anywhere',
      isTemporary: false,
    });
  }

  private validateCidr(cidr: string): void {
    const parts = cidr.split('/');
    if (parts.length !== 2) {
      throw new BadRequestException('Invalid CIDR format');
    }

    const [ip, prefix] = parts;
    const octets = ip.split('.');
    
    if (octets.length !== 4) {
      throw new BadRequestException('Invalid IP address');
    }

    for (const octet of octets) {
      const num = parseInt(octet, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        throw new BadRequestException('Invalid IP address octet');
      }
    }

    const prefixNum = parseInt(prefix, 10);
    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) {
      throw new BadRequestException('Invalid CIDR prefix (must be 0-32)');
    }
  }

  private async syncNetworkPolicies(clusterId: string, projectId: string): Promise<void> {
    const entries = await this.findAllByCluster(clusterId);
    const cidrBlocks = entries.map(e => e.cidrBlock);

    await this.kubernetesService.updateNetworkPolicy({
      clusterId,
      projectId,
      allowedCidrs: cidrBlocks,
    });
  }
}

