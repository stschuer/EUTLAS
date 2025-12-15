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
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { ClustersService } from './clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateClusterDto } from './dto/create-cluster.dto';
import { ResizeClusterDto } from './dto/resize-cluster.dto';
import { PauseClusterDto, ResumeClusterDto } from './dto/pause-cluster.dto';

@ApiTags('Clusters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters')
export class ClustersController {
  constructor(
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new cluster' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Body() createClusterDto: CreateClusterDto,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);
    
    const cluster = await this.clustersService.create(
      projectId,
      orgId,
      createClusterDto,
      user.userId, // Pass userId for email notification
    );
    
    return {
      success: true,
      data: cluster,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all clusters in project' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId);
    
    const clusters = await this.clustersService.findAllByProject(projectId);
    return {
      success: true,
      data: clusters,
    };
  }

  @Get(':clusterId')
  @ApiOperation({ summary: 'Get cluster by ID' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId);
    
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    return {
      success: true,
      data: cluster,
    };
  }

  @Get(':clusterId/credentials')
  @ApiOperation({ summary: 'Get cluster credentials' })
  async getCredentials(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);
    
    const result = await this.clustersService.findByIdWithCredentials(clusterId);
    if (!result || result.cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    return {
      success: true,
      data: result.credentials,
    };
  }

  @Post(':clusterId/resize')
  @ApiOperation({ summary: 'Resize cluster' })
  async resize(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() resizeClusterDto: ResizeClusterDto,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    const updated = await this.clustersService.resize(clusterId, resizeClusterDto);
    return {
      success: true,
      data: updated,
    };
  }

  @Post(':clusterId/pause')
  @ApiOperation({ summary: 'Pause a cluster to save costs' })
  async pause(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() pauseDto: PauseClusterDto,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    const updated = await this.clustersService.pause(clusterId, pauseDto.reason);
    return {
      success: true,
      data: updated,
      message: 'Cluster pause initiated. Data is preserved.',
    };
  }

  @Post(':clusterId/resume')
  @ApiOperation({ summary: 'Resume a paused cluster' })
  async resume(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() resumeDto: ResumeClusterDto,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    const updated = await this.clustersService.resume(clusterId, resumeDto.reason);
    return {
      success: true,
      data: updated,
      message: 'Cluster resume initiated.',
    };
  }

  @Post(':clusterId/clone')
  @ApiOperation({ summary: 'Clone a cluster' })
  async clone(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() body: { name: string; targetProjectId?: string; plan?: string },
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const sourceCluster = await this.clustersService.findById(clusterId);
    if (!sourceCluster || sourceCluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    const targetProjectId = body.targetProjectId || projectId;
    const clone = await this.clustersService.clone(
      clusterId,
      targetProjectId,
      body.name,
      body.plan,
    );

    return {
      success: true,
      data: clone,
      message: 'Cluster clone initiated',
    };
  }

  @Delete(':clusterId')
  @ApiOperation({ summary: 'Delete cluster' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    await this.clustersService.delete(clusterId);
    return {
      success: true,
      message: 'Cluster deletion initiated',
    };
  }
}

