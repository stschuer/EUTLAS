import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { DashboardsService } from './dashboards.service';
import { CreateDashboardDto, UpdateDashboardDto, AddWidgetDto, UpdateWidgetDto } from './dto/dashboard.dto';

@ApiTags('Dashboards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Get dashboard templates' })
  getTemplates() {
    const templates = this.dashboardsService.getTemplates();
    return { success: true, data: templates };
  }

  @Post()
  @ApiOperation({ summary: 'Create a dashboard' })
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateDashboardDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.create(orgId, user.userId, dto);
    return { success: true, data: dashboard };
  }

  @Post('from-template/:templateId')
  @ApiOperation({ summary: 'Create dashboard from template' })
  async createFromTemplate(
    @Param('orgId') orgId: string,
    @Param('templateId') templateId: string,
    @Query('clusterId') clusterId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.createFromTemplate(
      orgId,
      user.userId,
      templateId,
      clusterId,
    );
    return { success: true, data: dashboard };
  }

  @Get()
  @ApiOperation({ summary: 'List dashboards' })
  async list(
    @Param('orgId') orgId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboards = await this.dashboardsService.findByOrg(orgId, user.userId);
    return { success: true, data: dashboards };
  }

  @Get(':dashboardId')
  @ApiOperation({ summary: 'Get dashboard by ID' })
  async findOne(
    @Param('dashboardId') dashboardId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.findById(dashboardId, user.userId);
    return { success: true, data: dashboard };
  }

  @Patch(':dashboardId')
  @ApiOperation({ summary: 'Update dashboard' })
  async update(
    @Param('dashboardId') dashboardId: string,
    @Body() dto: UpdateDashboardDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.update(dashboardId, user.userId, dto);
    return { success: true, data: dashboard };
  }

  @Delete(':dashboardId')
  @ApiOperation({ summary: 'Delete dashboard' })
  async delete(
    @Param('dashboardId') dashboardId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.dashboardsService.delete(dashboardId, user.userId);
    return { success: true, message: 'Dashboard deleted' };
  }

  @Post(':dashboardId/duplicate')
  @ApiOperation({ summary: 'Duplicate dashboard' })
  async duplicate(
    @Param('dashboardId') dashboardId: string,
    @Body() body: { name: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.duplicate(
      dashboardId,
      user.userId,
      body.name,
    );
    return { success: true, data: dashboard };
  }

  @Post(':dashboardId/share')
  @ApiOperation({ summary: 'Share dashboard with users' })
  async share(
    @Param('dashboardId') dashboardId: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.share(
      dashboardId,
      user.userId,
      body.userIds,
    );
    return { success: true, data: dashboard };
  }

  // Widget operations
  @Post(':dashboardId/widgets')
  @ApiOperation({ summary: 'Add widget to dashboard' })
  async addWidget(
    @Param('dashboardId') dashboardId: string,
    @Body() dto: AddWidgetDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.addWidget(dashboardId, user.userId, dto);
    return { success: true, data: dashboard };
  }

  @Patch(':dashboardId/widgets/:widgetId')
  @ApiOperation({ summary: 'Update widget' })
  async updateWidget(
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() dto: UpdateWidgetDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.updateWidget(
      dashboardId,
      widgetId,
      user.userId,
      dto,
    );
    return { success: true, data: dashboard };
  }

  @Delete(':dashboardId/widgets/:widgetId')
  @ApiOperation({ summary: 'Remove widget from dashboard' })
  async removeWidget(
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboard = await this.dashboardsService.removeWidget(
      dashboardId,
      widgetId,
      user.userId,
    );
    return { success: true, data: dashboard };
  }
}

// Cluster-specific dashboard controller
@ApiTags('Dashboards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/dashboards')
export class ClusterDashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get()
  @ApiOperation({ summary: 'List dashboards for cluster' })
  async list(
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const dashboards = await this.dashboardsService.findByCluster(clusterId, user.userId);
    return { success: true, data: dashboards };
  }
}





