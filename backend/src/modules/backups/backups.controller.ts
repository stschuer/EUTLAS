import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { BackupsService } from './backups.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateBackupDto, RestoreBackupDto } from './dto/create-backup.dto';
import { BackupStatus } from './schemas/backup.schema';

@ApiTags('Backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/backups')
export class BackupsController {
  constructor(
    private readonly backupsService: BackupsService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual backup' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() createDto: CreateBackupDto,
  ) {
    const orgId = await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const backup = await this.backupsService.create(
      clusterId,
      projectId,
      orgId,
      user.userId,
      createDto,
      'manual',
    );

    return {
      success: true,
      data: backup,
      message: 'Backup initiated',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all backups for a cluster' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'in_progress', 'completed', 'failed'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('status') status?: BackupStatus,
    @Query('limit') limit?: number,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const backups = await this.backupsService.findAllByCluster(clusterId, {
      status,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    return {
      success: true,
      data: backups,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get backup statistics for a cluster' })
  async getStats(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const stats = await this.backupsService.getBackupStats(clusterId);

    return {
      success: true,
      data: stats,
    };
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get the latest completed backup' })
  async getLatest(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const backup = await this.backupsService.findLatestCompleted(clusterId);

    if (!backup) {
      throw new NotFoundException('No completed backups found');
    }

    return {
      success: true,
      data: backup,
    };
  }

  @Get(':backupId')
  @ApiOperation({ summary: 'Get backup details' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('backupId') backupId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const backup = await this.backupsService.findById(backupId);
    if (!backup || backup.clusterId.toString() !== clusterId) {
      throw new NotFoundException('Backup not found');
    }

    return {
      success: true,
      data: backup,
    };
  }

  @Post(':backupId/restore')
  @ApiOperation({ summary: 'Restore from a backup' })
  async restore(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('backupId') backupId: string,
    @Body() restoreDto: RestoreBackupDto,
  ) {
    const orgId = await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const backup = await this.backupsService.findById(backupId);
    if (!backup || backup.clusterId.toString() !== clusterId) {
      throw new NotFoundException('Backup not found');
    }

    const result = await this.backupsService.restore(
      backupId,
      projectId,
      orgId,
      user.userId,
      restoreDto,
    );

    return {
      success: true,
      ...result,
    };
  }

  @Delete(':backupId')
  @ApiOperation({ summary: 'Delete a backup' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('backupId') backupId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const backup = await this.backupsService.findById(backupId);
    if (!backup || backup.clusterId.toString() !== clusterId) {
      throw new NotFoundException('Backup not found');
    }

    await this.backupsService.delete(backupId);

    return {
      success: true,
      message: 'Backup deleted',
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
}
