import {
  Controller,
  Get,
  Post,
  Patch,
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
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { CreateClusterDto, CloneClusterDto } from './dto/create-cluster.dto';
import { ResizeClusterDto } from './dto/resize-cluster.dto';
import { UpdateClusterDto } from './dto/update-cluster.dto';
import { PauseClusterDto, ResumeClusterDto } from './dto/pause-cluster.dto';
import { AuditService } from '../audit/audit.service';

function auditActor(user: CurrentUserData) {
  return {
    actorId: user.userId,
    actorEmail: user.email,
    actorType: 'user' as const,
  };
}

@ApiTags('Clusters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters')
export class ClustersController {
  constructor(
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
    private readonly kubernetesService: KubernetesService,
    private readonly auditService: AuditService,
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

    await this.auditService.safeLog({
      orgId,
      projectId,
      clusterId: cluster.id,
      action: 'CLUSTER_CREATED',
      resourceType: 'cluster',
      resourceId: cluster.id,
      resourceName: cluster.name,
      ...auditActor(user),
      description: `Created cluster "${cluster.name}" (${createClusterDto.plan})`,
    });
    
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

  @Get(':clusterId/status')
  @ApiOperation({ summary: 'Get real-time cluster status from Kubernetes' })
  async getStatus(
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

    const k8sStatus = await this.kubernetesService.getClusterStatus(clusterId, projectId);

    return {
      success: true,
      data: {
        clusterId,
        dbStatus: cluster.status,
        k8s: k8sStatus,
      },
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

    await this.auditService.safeLog({
      orgId,
      projectId,
      clusterId,
      action: 'CLUSTER_RESIZED',
      resourceType: 'cluster',
      resourceId: clusterId,
      resourceName: cluster.name,
      ...auditActor(user),
      description: `Resized cluster "${cluster.name}" to ${resizeClusterDto.plan}`,
      previousState: { plan: cluster.plan },
      newState: { plan: resizeClusterDto.plan },
    });

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

    await this.auditService.safeLog({
      orgId,
      projectId,
      clusterId,
      action: 'CLUSTER_PAUSED',
      resourceType: 'cluster',
      resourceId: clusterId,
      resourceName: cluster.name,
      ...auditActor(user),
      description: `Paused cluster "${cluster.name}"`,
    });

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

    await this.auditService.safeLog({
      orgId,
      projectId,
      clusterId,
      action: 'CLUSTER_RESUMED',
      resourceType: 'cluster',
      resourceId: clusterId,
      resourceName: cluster.name,
      ...auditActor(user),
      description: `Resumed cluster "${cluster.name}"`,
    });

    return {
      success: true,
      data: updated,
      message: 'Cluster resume initiated.',
    };
  }

  @Post(':clusterId/enable-external-access')
  @ApiOperation({ summary: 'Enable external access for an existing cluster (creates NodePort service)' })
  async enableExternalAccess(
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

    // Create NodePort service and resolve external endpoint
    const endpoint = await this.kubernetesService.enableExternalAccess(clusterId, projectId, cluster.plan);

    // Persist the external endpoint to the cluster document
    if (endpoint) {
      await this.clustersService.updateExternalEndpoint(clusterId, endpoint.host, endpoint.port);
    }

    return {
      success: true,
      data: {
        externalHost: endpoint?.host || null,
        externalPort: endpoint?.port || null,
        message: endpoint
          ? `External access enabled at ${endpoint.host}:${endpoint.port}`
          : 'NodePort service created but external IP could not be resolved. Check node status.',
      },
    };
  }

  @Post(':clusterId/clone')
  @ApiOperation({ summary: 'Clone a cluster' })
  async clone(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() body: CloneClusterDto,
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

    await this.auditService.safeLog({
      orgId,
      projectId: targetProjectId,
      clusterId: clone.id,
      action: 'CLUSTER_CREATED',
      resourceType: 'cluster',
      resourceId: clone.id,
      resourceName: clone.name,
      ...auditActor(user),
      description: `Cloned cluster "${sourceCluster.name}" to "${clone.name}"`,
      metadata: { sourceClusterId: clusterId },
    });

    return {
      success: true,
      data: clone,
      message: 'Cluster clone initiated',
    };
  }

  @Patch(':clusterId')
  @ApiOperation({ summary: 'Update cluster properties (e.g., rename)' })
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() updateClusterDto: UpdateClusterDto,
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

    const updated = await this.clustersService.update(clusterId, updateClusterDto);

    await this.auditService.safeLog({
      orgId,
      projectId,
      clusterId,
      action: 'UPDATE',
      resourceType: 'cluster',
      resourceId: clusterId,
      resourceName: updated.name,
      ...auditActor(user),
      description: `Updated cluster "${cluster.name}"`,
      previousState: { name: cluster.name },
      newState: { name: updated.name },
    });

    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':clusterId')
  @ApiOperation({ summary: 'Delete cluster and all related data' })
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

    await this.auditService.safeLog({
      orgId,
      projectId,
      clusterId,
      action: 'CLUSTER_DELETED',
      resourceType: 'cluster',
      resourceId: clusterId,
      resourceName: cluster.name,
      ...auditActor(user),
      description: `Deleted cluster "${cluster.name}"`,
    });

    return {
      success: true,
      message: 'Cluster deletion initiated. Related data will be removed.',
    };
  }
}

