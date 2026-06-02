import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuditService } from '../audit/audit.service';

function auditActor(user: CurrentUserData) {
  return {
    actorId: user.userId,
    actorEmail: user.email,
    actorType: 'user' as const,
  };
}

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project in organization' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createProjectDto: CreateProjectDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);
    const project = await this.projectsService.create(orgId, createProjectDto);

    await this.auditService.safeLog({
      orgId,
      projectId: project.id,
      action: 'CREATE',
      resourceType: 'project',
      resourceId: project.id,
      resourceName: project.name,
      ...auditActor(user),
      description: `Created project "${project.name}"`,
    });

    return {
      success: true,
      data: project,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all projects in organization' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);
    const projects = await this.projectsService.findAllByOrg(orgId);
    return {
      success: true,
      data: projects,
    };
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get project by ID' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);
    const project = await this.projectsService.findById(projectId);
    
    if (!project || project.orgId.toString() !== orgId) {
      throw new NotFoundException('Project not found');
    }

    return {
      success: true,
      data: project,
    };
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update project' })
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const project = await this.projectsService.findById(projectId);
    if (!project || project.orgId.toString() !== orgId) {
      throw new NotFoundException('Project not found');
    }

    const updated = await this.projectsService.update(projectId, updateProjectDto);

    await this.auditService.safeLog({
      orgId,
      projectId,
      action: 'UPDATE',
      resourceType: 'project',
      resourceId: projectId,
      resourceName: updated.name,
      ...auditActor(user),
      description: `Updated project "${project.name}"`,
    });

    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Delete project and all related data (cascade delete)' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Query('force') force?: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    
    const project = await this.projectsService.findById(projectId);
    if (!project || project.orgId.toString() !== orgId) {
      throw new NotFoundException('Project not found');
    }

    const result = await this.projectsService.delete(projectId, force === 'true');

    await this.auditService.safeLog({
      orgId,
      projectId,
      action: 'DELETE',
      resourceType: 'project',
      resourceId: projectId,
      resourceName: project.name,
      ...auditActor(user),
      description: `Deleted project "${project.name}"`,
      metadata: result.deletedCounts,
    });

    return {
      success: true,
      message: 'Project and all related data deleted successfully',
      data: result,
    };
  }
}





