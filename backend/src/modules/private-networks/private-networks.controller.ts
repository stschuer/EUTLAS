import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PrivateNetworksService } from './private-networks.service';
import {
  CreatePrivateNetworkDto,
  UpdatePrivateNetworkDto,
  CreateSubnetDto,
  CreatePeeringDto,
  AttachClusterDto,
  UpdateClusterEndpointDto,
} from './dto/private-network.dto';

@ApiTags('Private Networks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/networks')
export class PrivateNetworksController {
  constructor(private readonly networksService: PrivateNetworksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a private network' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreatePrivateNetworkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId;
    const network = await this.networksService.create(projectId, orgId, user.userId, dto);
    return { success: true, data: network };
  }

  @Get()
  @ApiOperation({ summary: 'List private networks' })
  async findAll(@Param('projectId') projectId: string) {
    const networks = await this.networksService.findAllByProject(projectId);
    return { success: true, data: networks };
  }

  @Get('regions')
  @ApiOperation({ summary: 'Get available regions' })
  async getRegions() {
    const regions = this.networksService.getRegions();
    return { success: true, data: regions };
  }

  @Get(':networkId')
  @ApiOperation({ summary: 'Get private network details' })
  async findOne(@Param('networkId') networkId: string) {
    const network = await this.networksService.findById(networkId);
    if (!network) throw new NotFoundException('Network not found');
    return { success: true, data: network };
  }

  @Patch(':networkId')
  @ApiOperation({ summary: 'Update private network' })
  async update(
    @Param('networkId') networkId: string,
    @Body() dto: UpdatePrivateNetworkDto,
  ) {
    const network = await this.networksService.update(networkId, dto);
    return { success: true, data: network };
  }

  @Delete(':networkId')
  @ApiOperation({ summary: 'Delete private network' })
  async delete(
    @Param('networkId') networkId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.networksService.delete(networkId, user.userId);
    return { success: true, message: 'Network deletion initiated' };
  }

  // Subnets
  @Post(':networkId/subnets')
  @ApiOperation({ summary: 'Add subnet to network' })
  async addSubnet(
    @Param('networkId') networkId: string,
    @Body() dto: CreateSubnetDto,
  ) {
    const network = await this.networksService.addSubnet(networkId, dto);
    return { success: true, data: network };
  }

  @Delete(':networkId/subnets/:subnetId')
  @ApiOperation({ summary: 'Remove subnet from network' })
  async removeSubnet(
    @Param('networkId') networkId: string,
    @Param('subnetId') subnetId: string,
  ) {
    const network = await this.networksService.removeSubnet(networkId, subnetId);
    return { success: true, data: network };
  }

  // Peering
  @Post(':networkId/peering')
  @ApiOperation({ summary: 'Create peering connection' })
  async createPeering(
    @Param('networkId') networkId: string,
    @Body() dto: CreatePeeringDto,
  ) {
    const network = await this.networksService.createPeering(networkId, dto);
    return { success: true, data: network };
  }

  // Cluster attachment
  @Post(':networkId/clusters')
  @ApiOperation({ summary: 'Attach cluster to network' })
  async attachCluster(
    @Param('networkId') networkId: string,
    @Body() dto: AttachClusterDto,
  ) {
    const endpoint = await this.networksService.attachCluster(networkId, dto);
    return { success: true, data: endpoint };
  }

  @Delete(':networkId/clusters/:clusterId')
  @ApiOperation({ summary: 'Detach cluster from network' })
  async detachCluster(
    @Param('networkId') networkId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.networksService.detachCluster(networkId, clusterId);
    return { success: true, message: 'Cluster detached' };
  }
}

// Cluster endpoint controller
@ApiTags('Cluster Endpoints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/endpoint')
export class ClusterEndpointController {
  constructor(private readonly networksService: PrivateNetworksService) {}

  @Get()
  @ApiOperation({ summary: 'Get cluster endpoint configuration' })
  async getEndpoint(@Param('clusterId') clusterId: string) {
    const endpoint = await this.networksService.getClusterEndpoint(clusterId);
    return { success: true, data: endpoint };
  }

  @Patch()
  @ApiOperation({ summary: 'Update cluster endpoint configuration' })
  async updateEndpoint(
    @Param('clusterId') clusterId: string,
    @Body() dto: UpdateClusterEndpointDto,
  ) {
    const endpoint = await this.networksService.updateClusterEndpoint(clusterId, dto);
    return { success: true, data: endpoint };
  }
}


