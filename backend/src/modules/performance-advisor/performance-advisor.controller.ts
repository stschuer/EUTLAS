import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PerformanceAdvisorService } from './performance-advisor.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import {
  QuerySlowQueriesDto,
  ExplainQueryDto,
  AnalyzeQueryDto,
  ApplyIndexSuggestionDto,
  DismissIndexSuggestionDto,
  ProfilerSettingsDto,
} from './dto/performance-advisor.dto';

@ApiTags('Performance Advisor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/performance')
export class PerformanceAdvisorController {
  constructor(
    private readonly performanceAdvisorService: PerformanceAdvisorService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  // ==================== Slow Queries ====================

  @Get('slow-queries')
  @ApiOperation({ summary: 'Get slow queries' })
  async getSlowQueries(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query() queryDto: QuerySlowQueriesDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const slowQueries = await this.performanceAdvisorService.getSlowQueries(clusterId, queryDto);

    return {
      success: true,
      data: slowQueries,
    };
  }

  @Get('slow-queries/:queryId')
  @ApiOperation({ summary: 'Get slow query details' })
  async getSlowQueryDetails(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('queryId') queryId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const query = await this.performanceAdvisorService.getSlowQueryById(queryId);
    if (!query) {
      throw new NotFoundException('Slow query not found');
    }

    return {
      success: true,
      data: query,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get performance statistics' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to analyze' })
  async getStats(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('days') days?: number,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const stats = await this.performanceAdvisorService.getSlowQueryStats(clusterId, days || 7);

    return {
      success: true,
      data: stats,
    };
  }

  // ==================== Query Analysis ====================

  @Post('explain')
  @ApiOperation({ summary: 'Explain a query execution plan' })
  async explainQuery(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() explainDto: ExplainQueryDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const explanation = await this.performanceAdvisorService.explainQuery(clusterId, explainDto);

    return {
      success: true,
      data: explanation,
    };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze a query and get recommendations' })
  async analyzeQuery(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() analyzeDto: AnalyzeQueryDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const analysis = await this.performanceAdvisorService.analyzeQuery(clusterId, analyzeDto);

    return {
      success: true,
      data: analysis,
    };
  }

  // ==================== Index Suggestions ====================

  @Get('suggestions')
  @ApiOperation({ summary: 'Get index suggestions' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'applied', 'dismissed'] })
  async getIndexSuggestions(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('status') status?: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const suggestions = await this.performanceAdvisorService.getIndexSuggestions(clusterId, status);

    return {
      success: true,
      data: suggestions,
    };
  }

  @Get('suggestions/:suggestionId')
  @ApiOperation({ summary: 'Get index suggestion details' })
  async getSuggestionDetails(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('suggestionId') suggestionId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const suggestion = await this.performanceAdvisorService.getSuggestionById(suggestionId);
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    return {
      success: true,
      data: suggestion,
    };
  }

  @Post('suggestions/:suggestionId/apply')
  @ApiOperation({ summary: 'Apply an index suggestion' })
  async applySuggestion(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() applyDto: ApplyIndexSuggestionDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.performanceAdvisorService.applySuggestion(
      suggestionId,
      user.userId,
      applyDto,
    );

    return {
      success: true,
      message: 'Index suggestion applied',
    };
  }

  @Post('suggestions/:suggestionId/dismiss')
  @ApiOperation({ summary: 'Dismiss an index suggestion' })
  async dismissSuggestion(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() dismissDto: DismissIndexSuggestionDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.performanceAdvisorService.dismissSuggestion(
      suggestionId,
      user.userId,
      dismissDto.reason,
    );

    return {
      success: true,
      message: 'Index suggestion dismissed',
    };
  }

  // ==================== Profiler Settings ====================

  @Get('profiler/:database')
  @ApiOperation({ summary: 'Get profiler status for a database' })
  async getProfilerStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('database') database: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const status = await this.performanceAdvisorService.getProfilerStatus(clusterId, database);

    return {
      success: true,
      data: status,
    };
  }

  @Patch('profiler/:database')
  @ApiOperation({ summary: 'Set profiler level for a database' })
  async setProfilerLevel(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('database') database: string,
    @Body() settingsDto: ProfilerSettingsDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.performanceAdvisorService.setProfilerLevel(
      clusterId,
      database,
      settingsDto.level,
      settingsDto.slowMs,
      settingsDto.sampleRate,
    );

    return {
      success: true,
      message: `Profiler set to ${settingsDto.level}`,
    };
  }

  // ==================== Helper ====================

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



