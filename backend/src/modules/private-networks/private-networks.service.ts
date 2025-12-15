import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { PrivateNetwork, PrivateNetworkDocument } from './schemas/private-network.schema';
import { ClusterEndpoint, ClusterEndpointDocument } from './schemas/cluster-endpoint.schema';
import {
  CreatePrivateNetworkDto,
  UpdatePrivateNetworkDto,
  CreateSubnetDto,
  CreatePeeringDto,
  AttachClusterDto,
  UpdateClusterEndpointDto,
} from './dto/private-network.dto';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';

const REGION_LABELS: Record<string, string> = {
  fsn1: 'Falkenstein, Germany',
  nbg1: 'Nuremberg, Germany',
  hel1: 'Helsinki, Finland',
};

@Injectable()
export class PrivateNetworksService {
  private readonly logger = new Logger(PrivateNetworksService.name);

  constructor(
    @InjectModel(PrivateNetwork.name) private networkModel: Model<PrivateNetworkDocument>,
    @InjectModel(ClusterEndpoint.name) private endpointModel: Model<ClusterEndpointDocument>,
    private eventsService: EventsService,
    private auditService: AuditService,
  ) {}

  async create(
    projectId: string,
    orgId: string,
    userId: string,
    dto: CreatePrivateNetworkDto,
  ): Promise<PrivateNetwork> {
    // Validate IP range doesn't overlap with existing networks
    const existing = await this.networkModel.findOne({
      projectId: new Types.ObjectId(projectId),
      ipRange: dto.ipRange,
      status: { $ne: 'deleting' },
    });

    if (existing) {
      throw new ConflictException('A network with this IP range already exists');
    }

    const network = new this.networkModel({
      orgId: new Types.ObjectId(orgId),
      projectId: new Types.ObjectId(projectId),
      name: dto.name,
      description: dto.description,
      region: dto.region,
      ipRange: dto.ipRange,
      status: 'creating',
      labels: dto.labels ? new Map(Object.entries(dto.labels)) : new Map(),
      createdBy: new Types.ObjectId(userId),
    });

    await network.save();

    // Simulate Hetzner network creation
    this.provisionNetwork(network.id);

    await this.auditService.log({
      orgId,
      projectId,
      action: 'CREATE',
      resourceType: 'cluster', // Using existing type for now
      resourceId: network.id,
      resourceName: dto.name,
      actorId: userId,
      description: `Created private network "${dto.name}" in ${REGION_LABELS[dto.region]}`,
    });

    this.logger.log(`Created private network ${network.id} in ${dto.region}`);
    return network;
  }

  private async provisionNetwork(networkId: string): Promise<void> {
    // Simulate async provisioning
    await new Promise(resolve => setTimeout(resolve, 2000));

    const network = await this.networkModel.findById(networkId);
    if (!network) return;

    try {
      // Simulate Hetzner API call
      network.hetznerNetworkId = `hcloud-net-${uuidv4().slice(0, 8)}`;
      network.status = 'active';

      // Create default subnet
      const defaultSubnet = {
        id: uuidv4(),
        name: 'default',
        ipRange: network.ipRange.replace('/16', '/24'),
        zone: `${network.region}-dc1`,
        gateway: network.ipRange.replace(/\.0\/\d+$/, '.1'),
      };
      network.subnets.push(defaultSubnet);

      await network.save();
      this.logger.log(`Provisioned network ${networkId}`);
    } catch (error) {
      network.status = 'failed';
      network.errorMessage = error.message;
      await network.save();
      this.logger.error(`Failed to provision network ${networkId}: ${error.message}`);
    }
  }

  async findAllByProject(projectId: string): Promise<PrivateNetwork[]> {
    return this.networkModel
      .find({
        projectId: new Types.ObjectId(projectId),
        status: { $ne: 'deleting' },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(networkId: string): Promise<PrivateNetwork | null> {
    return this.networkModel.findById(networkId).exec();
  }

  async update(networkId: string, dto: UpdatePrivateNetworkDto): Promise<PrivateNetwork> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    if (dto.name) network.name = dto.name;
    if (dto.description !== undefined) network.description = dto.description;
    if (dto.labels) network.labels = new Map(Object.entries(dto.labels));

    await network.save();
    return network;
  }

  async delete(networkId: string, userId: string): Promise<void> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    if (network.connectedClusters.length > 0) {
      throw new BadRequestException('Cannot delete network with connected clusters. Detach all clusters first.');
    }

    network.status = 'deleting';
    await network.save();

    await this.auditService.log({
      orgId: network.orgId.toString(),
      projectId: network.projectId.toString(),
      action: 'DELETE',
      resourceType: 'cluster',
      resourceId: network.id,
      resourceName: network.name,
      actorId: userId,
      description: `Deleted private network "${network.name}"`,
    });

    // Simulate cleanup
    setTimeout(async () => {
      await this.networkModel.findByIdAndDelete(networkId);
    }, 3000);
  }

  async addSubnet(networkId: string, dto: CreateSubnetDto): Promise<PrivateNetwork> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    const subnet = {
      id: uuidv4(),
      name: dto.name,
      ipRange: dto.ipRange,
      zone: dto.zone,
      gateway: dto.gateway,
    };

    network.subnets.push(subnet);
    await network.save();

    return network;
  }

  async removeSubnet(networkId: string, subnetId: string): Promise<PrivateNetwork> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    network.subnets = network.subnets.filter(s => s.id !== subnetId);
    await network.save();

    return network;
  }

  async createPeering(networkId: string, dto: CreatePeeringDto): Promise<PrivateNetwork> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    const peering = {
      id: uuidv4(),
      name: dto.name,
      status: 'pending' as const,
      peerNetworkId: dto.peerNetworkId,
      peerIpRange: dto.peerIpRange,
      createdAt: new Date(),
    };

    network.peeringConnections.push(peering);
    await network.save();

    // Simulate peering establishment
    setTimeout(async () => {
      const n = await this.networkModel.findById(networkId);
      if (n) {
        const p = n.peeringConnections.find(x => x.id === peering.id);
        if (p) {
          p.status = 'active';
          await n.save();
        }
      }
    }, 3000);

    return network;
  }

  async attachCluster(networkId: string, dto: AttachClusterDto): Promise<ClusterEndpoint> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    if (network.status !== 'active') {
      throw new BadRequestException('Network is not active');
    }

    // Check if cluster already has an endpoint
    let endpoint = await this.endpointModel.findOne({
      clusterId: new Types.ObjectId(dto.clusterId),
    });

    if (endpoint && endpoint.privateNetworkId) {
      throw new ConflictException('Cluster is already attached to a network');
    }

    // Generate private IP
    const baseIp = network.ipRange.split('/')[0].replace(/\.\d+$/, '');
    const usedIps = await this.endpointModel.find({
      privateNetworkId: new Types.ObjectId(networkId),
    }).select('privateIpAddress');
    
    const nextOctet = usedIps.length + 10; // Start from .10
    const privateIp = dto.privateIp || `${baseIp}.${nextOctet}`;

    if (!endpoint) {
      endpoint = new this.endpointModel({
        clusterId: new Types.ObjectId(dto.clusterId),
        privateNetworkId: new Types.ObjectId(networkId),
        endpointType: 'both',
        publicEndpointEnabled: true,
        privateEndpointEnabled: true,
        privateIpAddress: privateIp,
        privateHostname: `cluster-${dto.clusterId.slice(-8)}.private.eutlas.local`,
        privatePort: 27017,
      });
    } else {
      endpoint.privateNetworkId = new Types.ObjectId(networkId);
      endpoint.privateIpAddress = privateIp;
      endpoint.privateHostname = `cluster-${dto.clusterId.slice(-8)}.private.eutlas.local`;
      endpoint.privateEndpointEnabled = true;
      endpoint.endpointType = 'both';
    }

    await endpoint.save();

    // Add cluster to network's connected clusters
    if (!network.connectedClusters.includes(new Types.ObjectId(dto.clusterId))) {
      network.connectedClusters.push(new Types.ObjectId(dto.clusterId));
      await network.save();
    }

    return endpoint;
  }

  async detachCluster(networkId: string, clusterId: string): Promise<void> {
    const network = await this.networkModel.findById(networkId);
    if (!network) {
      throw new NotFoundException('Private network not found');
    }

    const endpoint = await this.endpointModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
    });

    if (endpoint) {
      endpoint.privateNetworkId = undefined;
      endpoint.privateIpAddress = undefined;
      endpoint.privateHostname = undefined;
      endpoint.privateEndpointEnabled = false;
      endpoint.endpointType = 'public';
      await endpoint.save();
    }

    network.connectedClusters = network.connectedClusters.filter(
      c => c.toString() !== clusterId
    );
    await network.save();
  }

  async getClusterEndpoint(clusterId: string): Promise<ClusterEndpoint | null> {
    return this.endpointModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
    }).exec();
  }

  async updateClusterEndpoint(
    clusterId: string,
    dto: UpdateClusterEndpointDto,
  ): Promise<ClusterEndpoint> {
    let endpoint = await this.endpointModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
    });

    if (!endpoint) {
      endpoint = new this.endpointModel({
        clusterId: new Types.ObjectId(clusterId),
        endpointType: dto.endpointType || 'public',
        publicEndpointEnabled: dto.publicEndpointEnabled ?? true,
        privateEndpointEnabled: dto.privateEndpointEnabled ?? false,
        minTlsVersion: dto.minTlsVersion || 'TLS1.2',
      });
    } else {
      if (dto.endpointType) endpoint.endpointType = dto.endpointType;
      if (dto.publicEndpointEnabled !== undefined) endpoint.publicEndpointEnabled = dto.publicEndpointEnabled;
      if (dto.privateEndpointEnabled !== undefined) endpoint.privateEndpointEnabled = dto.privateEndpointEnabled;
      if (dto.minTlsVersion) endpoint.minTlsVersion = dto.minTlsVersion as any;
    }

    await endpoint.save();
    return endpoint;
  }

  getRegions(): Array<{ id: string; name: string; location: string }> {
    return [
      { id: 'fsn1', name: 'Falkenstein', location: 'Germany' },
      { id: 'nbg1', name: 'Nuremberg', location: 'Germany' },
      { id: 'hel1', name: 'Helsinki', location: 'Finland' },
    ];
  }
}





