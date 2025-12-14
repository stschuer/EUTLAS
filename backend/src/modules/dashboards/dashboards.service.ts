import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Dashboard, DashboardDocument, DashboardWidget } from './schemas/dashboard.schema';
import { CreateDashboardDto, UpdateDashboardDto, AddWidgetDto, UpdateWidgetDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardsService {
  private readonly logger = new Logger(DashboardsService.name);

  constructor(
    @InjectModel(Dashboard.name) private dashboardModel: Model<DashboardDocument>,
  ) {}

  async create(orgId: string, userId: string, dto: CreateDashboardDto): Promise<Dashboard> {
    const dashboard = new this.dashboardModel({
      orgId: new Types.ObjectId(orgId),
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      clusterId: dto.clusterId ? new Types.ObjectId(dto.clusterId) : undefined,
      name: dto.name,
      description: dto.description,
      widgets: dto.widgets || [],
      visibility: dto.visibility || 'private',
      layout: dto.layout || { columns: 12, rowHeight: 100 },
      timeRange: dto.timeRange || { from: 'now-1h', to: 'now', refresh: 30 },
      createdBy: new Types.ObjectId(userId),
    });

    await dashboard.save();
    this.logger.log(`Created dashboard ${dashboard.id} for org ${orgId}`);
    return dashboard;
  }

  async findByOrg(orgId: string, userId: string): Promise<Dashboard[]> {
    return this.dashboardModel.find({
      $or: [
        { orgId: new Types.ObjectId(orgId), visibility: 'org' },
        { orgId: new Types.ObjectId(orgId), visibility: 'public' },
        { orgId: new Types.ObjectId(orgId), createdBy: new Types.ObjectId(userId) },
        { sharedWith: new Types.ObjectId(userId) },
      ],
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByCluster(clusterId: string, userId: string): Promise<Dashboard[]> {
    return this.dashboardModel.find({
      clusterId: new Types.ObjectId(clusterId),
      $or: [
        { visibility: { $in: ['org', 'public'] } },
        { createdBy: new Types.ObjectId(userId) },
        { sharedWith: new Types.ObjectId(userId) },
      ],
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(dashboardId: string, userId: string): Promise<Dashboard> {
    const dashboard = await this.dashboardModel.findById(dashboardId).exec();
    
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found');
    }

    // Check access
    const canAccess =
      dashboard.visibility === 'public' ||
      dashboard.visibility === 'org' ||
      dashboard.createdBy.toString() === userId ||
      dashboard.sharedWith.some(id => id.toString() === userId);

    if (!canAccess) {
      throw new ForbiddenException('Access denied');
    }

    return dashboard;
  }

  async update(dashboardId: string, userId: string, dto: UpdateDashboardDto): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId, userId);

    // Only owner can update
    if (dashboard.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the owner can update this dashboard');
    }

    if (dto.name !== undefined) dashboard.name = dto.name;
    if (dto.description !== undefined) dashboard.description = dto.description;
    if (dto.widgets !== undefined) dashboard.widgets = dto.widgets as DashboardWidget[];
    if (dto.visibility !== undefined) dashboard.visibility = dto.visibility;
    if (dto.isDefault !== undefined) dashboard.isDefault = dto.isDefault;
    if (dto.layout !== undefined) dashboard.layout = dto.layout;
    if (dto.timeRange !== undefined) dashboard.timeRange = dto.timeRange;
    dashboard.updatedBy = new Types.ObjectId(userId);

    await (dashboard as DashboardDocument).save();
    return dashboard;
  }

  async delete(dashboardId: string, userId: string): Promise<void> {
    const dashboard = await this.findById(dashboardId, userId);

    if (dashboard.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the owner can delete this dashboard');
    }

    await this.dashboardModel.findByIdAndDelete(dashboardId);
    this.logger.log(`Deleted dashboard ${dashboardId}`);
  }

  async addWidget(dashboardId: string, userId: string, dto: AddWidgetDto): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId, userId);

    if (dashboard.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the owner can modify this dashboard');
    }

    const widget: DashboardWidget = {
      id: dto.id || uuidv4(),
      title: dto.title,
      type: dto.type as any,
      metrics: dto.metrics || [],
      query: dto.query as any,
      position: dto.position as any,
      options: dto.options,
      description: dto.description,
    };

    dashboard.widgets.push(widget);
    dashboard.updatedBy = new Types.ObjectId(userId);
    await (dashboard as DashboardDocument).save();

    return dashboard;
  }

  async updateWidget(
    dashboardId: string,
    widgetId: string,
    userId: string,
    dto: UpdateWidgetDto,
  ): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId, userId);

    if (dashboard.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the owner can modify this dashboard');
    }

    const widgetIndex = dashboard.widgets.findIndex(w => w.id === widgetId);
    if (widgetIndex === -1) {
      throw new NotFoundException('Widget not found');
    }

    const widget = dashboard.widgets[widgetIndex];
    if (dto.title !== undefined) widget.title = dto.title;
    if (dto.position !== undefined) widget.position = dto.position as any;
    if (dto.options !== undefined) widget.options = dto.options;
    if (dto.query !== undefined) widget.query = dto.query as any;

    dashboard.updatedBy = new Types.ObjectId(userId);
    await (dashboard as DashboardDocument).save();

    return dashboard;
  }

  async removeWidget(dashboardId: string, widgetId: string, userId: string): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId, userId);

    if (dashboard.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the owner can modify this dashboard');
    }

    dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
    dashboard.updatedBy = new Types.ObjectId(userId);
    await (dashboard as DashboardDocument).save();

    return dashboard;
  }

  async duplicate(dashboardId: string, userId: string, newName: string): Promise<Dashboard> {
    const original = await this.findById(dashboardId, userId);

    const dashboard = new this.dashboardModel({
      orgId: original.orgId,
      projectId: original.projectId,
      clusterId: original.clusterId,
      name: newName,
      description: original.description,
      widgets: original.widgets,
      visibility: 'private',
      layout: original.layout,
      timeRange: original.timeRange,
      variables: original.variables,
      createdBy: new Types.ObjectId(userId),
    });

    await dashboard.save();
    this.logger.log(`Duplicated dashboard ${dashboardId} to ${dashboard.id}`);
    return dashboard;
  }

  async share(dashboardId: string, userId: string, shareWithUserIds: string[]): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId, userId);

    if (dashboard.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the owner can share this dashboard');
    }

    dashboard.sharedWith = shareWithUserIds.map(id => new Types.ObjectId(id));
    dashboard.isShared = shareWithUserIds.length > 0;
    dashboard.updatedBy = new Types.ObjectId(userId);
    await (dashboard as DashboardDocument).save();

    return dashboard;
  }

  // Get dashboard templates
  getTemplates(): Array<{ id: string; name: string; description: string; widgets: any[] }> {
    return [
      {
        id: 'cluster-overview',
        name: 'Cluster Overview',
        description: 'Essential metrics for cluster monitoring',
        widgets: [
          {
            id: 'cpu-gauge',
            title: 'CPU Usage',
            type: 'gauge',
            query: { metric: 'cpu_percent', aggregation: 'avg' },
            position: { x: 0, y: 0, width: 3, height: 2 },
            options: { unit: '%', thresholds: [{ value: 80, color: 'red' }] },
          },
          {
            id: 'memory-gauge',
            title: 'Memory Usage',
            type: 'gauge',
            query: { metric: 'memory_percent', aggregation: 'avg' },
            position: { x: 3, y: 0, width: 3, height: 2 },
            options: { unit: '%', thresholds: [{ value: 80, color: 'red' }] },
          },
          {
            id: 'connections-stat',
            title: 'Active Connections',
            type: 'stat',
            query: { metric: 'connections', aggregation: 'max' },
            position: { x: 6, y: 0, width: 3, height: 2 },
          },
          {
            id: 'ops-stat',
            title: 'Operations/sec',
            type: 'stat',
            query: { metric: 'operations_per_sec', aggregation: 'avg' },
            position: { x: 9, y: 0, width: 3, height: 2 },
          },
          {
            id: 'cpu-chart',
            title: 'CPU Over Time',
            type: 'line_chart',
            query: { metric: 'cpu_percent' },
            position: { x: 0, y: 2, width: 6, height: 3 },
          },
          {
            id: 'memory-chart',
            title: 'Memory Over Time',
            type: 'line_chart',
            query: { metric: 'memory_percent' },
            position: { x: 6, y: 2, width: 6, height: 3 },
          },
        ],
      },
      {
        id: 'performance',
        name: 'Performance Dashboard',
        description: 'Query performance and operations metrics',
        widgets: [
          {
            id: 'query-time',
            title: 'Avg Query Time',
            type: 'stat',
            query: { metric: 'query_time_avg', aggregation: 'avg' },
            position: { x: 0, y: 0, width: 4, height: 2 },
            options: { unit: 'ms' },
          },
          {
            id: 'ops-chart',
            title: 'Operations Breakdown',
            type: 'area_chart',
            metrics: ['reads', 'writes', 'commands'],
            position: { x: 0, y: 2, width: 12, height: 4 },
            options: { stacked: true },
          },
        ],
      },
      {
        id: 'storage',
        name: 'Storage Dashboard',
        description: 'Storage and disk metrics',
        widgets: [
          {
            id: 'storage-gauge',
            title: 'Storage Used',
            type: 'gauge',
            query: { metric: 'storage_percent', aggregation: 'avg' },
            position: { x: 0, y: 0, width: 4, height: 2 },
            options: { unit: '%', thresholds: [{ value: 90, color: 'red' }] },
          },
          {
            id: 'network-chart',
            title: 'Network I/O',
            type: 'line_chart',
            metrics: ['network_in', 'network_out'],
            position: { x: 0, y: 2, width: 12, height: 4 },
            options: { showLegend: true },
          },
        ],
      },
    ];
  }

  async createFromTemplate(
    orgId: string,
    userId: string,
    templateId: string,
    clusterId?: string,
  ): Promise<Dashboard> {
    const templates = this.getTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return this.create(orgId, userId, {
      name: template.name,
      description: template.description,
      clusterId,
      widgets: template.widgets,
    });
  }
}




