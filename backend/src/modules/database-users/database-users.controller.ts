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
import { DatabaseUsersService } from './database-users.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateDatabaseUserDto } from './dto/create-database-user.dto';
import { UpdateDatabaseUserDto } from './dto/update-database-user.dto';

@ApiTags('Database Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/users')
export class DatabaseUsersController {
  constructor(
    private readonly dbUsersService: DatabaseUsersService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a database user for a cluster' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() createDto: CreateDatabaseUserDto,
  ) {
    // Verify access
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);

    // Verify cluster belongs to project
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    const dbUser = await this.dbUsersService.create(
      clusterId,
      projectId,
      orgId,
      createDto,
    );

    return {
      success: true,
      data: dbUser,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all database users for a cluster' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    // Verify access
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }
    await this.orgsService.checkAccess(orgId, user.userId);

    // Verify cluster belongs to project
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    const users = await this.dbUsersService.findAllByCluster(clusterId);

    return {
      success: true,
      data: users,
    };
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get a database user by ID' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('userId') userId: string,
  ) {
    // Verify access
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }
    await this.orgsService.checkAccess(orgId, user.userId);

    const dbUser = await this.dbUsersService.findById(userId);
    if (!dbUser || dbUser.clusterId.toString() !== clusterId) {
      throw new NotFoundException('Database user not found');
    }

    return {
      success: true,
      data: dbUser,
    };
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update a database user' })
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('userId') userId: string,
    @Body() updateDto: UpdateDatabaseUserDto,
  ) {
    // Verify access
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const dbUser = await this.dbUsersService.findById(userId);
    if (!dbUser || dbUser.clusterId.toString() !== clusterId) {
      throw new NotFoundException('Database user not found');
    }

    const updated = await this.dbUsersService.update(userId, updateDto);

    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Delete a database user' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('userId') userId: string,
  ) {
    // Verify access
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const dbUser = await this.dbUsersService.findById(userId);
    if (!dbUser || dbUser.clusterId.toString() !== clusterId) {
      throw new NotFoundException('Database user not found');
    }

    await this.dbUsersService.delete(userId);

    return {
      success: true,
      message: 'Database user deleted successfully',
    };
  }
}





