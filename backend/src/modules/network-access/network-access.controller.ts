import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { NetworkAccessService } from './network-access.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateIpWhitelistDto } from './dto/create-ip-whitelist.dto';

@ApiTags('Network Access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/network')
export class NetworkAccessController {
  constructor(
    private readonly networkAccessService: NetworkAccessService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post('whitelist')
  @ApiOperation({ summary: 'Add an IP address or CIDR range to the whitelist' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() createDto: CreateIpWhitelistDto,
  ) {
    const orgId = await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const entry = await this.networkAccessService.create(
      clusterId,
      projectId,
      orgId,
      user.userId,
      createDto,
    );

    return {
      success: true,
      data: entry,
    };
  }

  @Get('whitelist')
  @ApiOperation({ summary: 'List all IP whitelist entries for a cluster' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const entries = await this.networkAccessService.findAllByCluster(clusterId);

    return {
      success: true,
      data: entries,
    };
  }

  @Delete('whitelist/:entryId')
  @ApiOperation({ summary: 'Remove an IP whitelist entry' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('entryId') entryId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const entry = await this.networkAccessService.findById(entryId);
    if (!entry || entry.clusterId.toString() !== clusterId) {
      throw new NotFoundException('IP whitelist entry not found');
    }

    await this.networkAccessService.delete(entryId);

    return {
      success: true,
      message: 'IP whitelist entry removed',
    };
  }

  @Post('whitelist/add-current-ip')
  @ApiOperation({ summary: 'Add the current IP address to the whitelist' })
  async addCurrentIp(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Req() req: Request,
  ) {
    const orgId = await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN', 'MEMBER']);

    // Get client IP from request
    const clientIp = this.getClientIp(req);

    const entry = await this.networkAccessService.addCurrentIp(
      clusterId,
      projectId,
      orgId,
      user.userId,
      clientIp,
    );

    return {
      success: true,
      data: entry,
      message: `Added your IP address (${clientIp}) to the whitelist`,
    };
  }

  @Post('whitelist/allow-anywhere')
  @ApiOperation({ summary: 'Allow access from any IP address (0.0.0.0/0)' })
  async allowFromAnywhere(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    const orgId = await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const entry = await this.networkAccessService.allowFromAnywhere(
      clusterId,
      projectId,
      orgId,
      user.userId,
    );

    return {
      success: true,
      data: entry,
      message: 'Cluster is now accessible from any IP address. This is not recommended for production.',
    };
  }

  private async verifyAccess(
    userId: string,
    projectId: string,
    clusterId: string,
    requiredRoles?: ('OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY')[],
  ): Promise<string> {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, userId, requiredRoles);

    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    return orgId;
  }

  @Get('my-ip')
  @ApiOperation({ summary: 'Get your current IP address' })
  async getMyIp(
    @Req() req: Request,
  ) {
    const clientIp = this.getClientIp(req);

    return {
      success: true,
      data: {
        ip: clientIp,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private getClientIp(req: Request): string {
    // Check various headers for the real IP
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
      return this.normalizeIp(ips[0].trim());
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return this.normalizeIp(Array.isArray(realIp) ? realIp[0] : realIp);
    }

    return this.normalizeIp(req.ip || req.socket.remoteAddress || '0.0.0.0');
  }

  private normalizeIp(ip: string): string {
    // Convert IPv6-mapped IPv4 (::ffff:127.0.0.1) to IPv4
    if (ip.startsWith('::ffff:')) {
      return ip.slice(7);
    }
    // Convert IPv6 localhost to IPv4 localhost
    if (ip === '::1') {
      return '127.0.0.1';
    }
    return ip;
  }
}



