import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { MetricsService } from './metrics.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import { MetricType } from './schemas/metric.schema';

@ApiTags('Metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all metrics for a cluster' })
  @ApiQuery({ name: 'period', required: false, enum: ['1h', '6h', '24h', '7d', '30d'] })
  async getMetrics(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('period') period: '1h' | '6h' | '24h' | '7d' | '30d' = '24h',
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const metrics = await this.metricsService.getMetrics(clusterId, period);

    return {
      success: true,
      data: metrics,
      period,
    };
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current/latest metrics for a cluster' })
  async getCurrentMetrics(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const metrics = await this.metricsService.getCurrentMetrics(clusterId);

    if (!metrics) {
      return {
        success: true,
        data: null,
        message: 'No metrics available yet',
      };
    }

    return {
      success: true,
      data: metrics,
    };
  }

  @Get(':metricType')
  @ApiOperation({ summary: 'Get a specific metric type with aggregation' })
  @ApiQuery({ name: 'period', required: false, enum: ['1h', '6h', '24h', '7d', '30d'] })
  @ApiQuery({ name: 'aggregation', required: false, enum: ['avg', 'max', 'min', 'sum'] })
  async getMetricByType(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('metricType') metricType: MetricType,
    @Query('period') period: '1h' | '6h' | '24h' | '7d' | '30d' = '24h',
    @Query('aggregation') aggregation: 'avg' | 'max' | 'min' | 'sum' = 'avg',
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const data = await this.metricsService.getAggregatedMetrics(
      clusterId,
      metricType,
      period,
      aggregation,
    );

    return {
      success: true,
      data,
      metricType,
      period,
      aggregation,
    };
  }

  private async verifyAccess(
    userId: string,
    projectId: string,
    clusterId: string,
  ): Promise<string> {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, userId);

    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    return orgId;
  }
}


