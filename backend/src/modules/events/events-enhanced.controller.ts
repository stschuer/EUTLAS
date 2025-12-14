import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { EventsEnhancedService } from './events-enhanced.service';
import { EventFilterDto } from './dto/events.dto';

@ApiTags('Activity Feed')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/activity')
export class ActivityFeedController {
  constructor(private readonly eventsService: EventsEnhancedService) {}

  @Get()
  @ApiOperation({ summary: 'Get activity feed with filters' })
  @ApiQuery({ name: 'types', required: false, type: String, description: 'Comma-separated event types' })
  @ApiQuery({ name: 'severities', required: false, type: String, description: 'Comma-separated severity levels' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'clusterId', required: false, type: String })
  @ApiQuery({ name: 'projectId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getActivityFeed(
    @Param('orgId') orgId: string,
    @Query() filters: EventFilterDto,
  ) {
    const result = await this.eventsService.findWithFilters(orgId, filters);
    return {
      success: true,
      ...result,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get activity statistics' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to analyze (default 7)' })
  async getActivityStats(
    @Param('orgId') orgId: string,
    @Query('days') days?: number,
  ) {
    const stats = await this.eventsService.getEventStats(orgId, days || 7);
    return {
      success: true,
      data: stats,
    };
  }

  @Get('export/json')
  @ApiOperation({ summary: 'Export activity feed as JSON' })
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="activity-feed.json"')
  async exportJson(
    @Param('orgId') orgId: string,
    @Query() filters: EventFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.eventsService.exportEvents(orgId, filters, 'json');
    res.send(data);
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export activity feed as CSV' })
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="activity-feed.csv"')
  async exportCsv(
    @Param('orgId') orgId: string,
    @Query() filters: EventFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.eventsService.exportEvents(orgId, filters, 'csv');
    res.send(data);
  }

  @Get('types')
  @ApiOperation({ summary: 'Get available event types' })
  getEventTypes() {
    return {
      success: true,
      data: [
        // Cluster events
        { value: 'CLUSTER_CREATED', label: 'Cluster Created', category: 'Cluster' },
        { value: 'CLUSTER_UPDATED', label: 'Cluster Updated', category: 'Cluster' },
        { value: 'CLUSTER_RESIZED', label: 'Cluster Resized', category: 'Cluster' },
        { value: 'CLUSTER_DELETED', label: 'Cluster Deleted', category: 'Cluster' },
        { value: 'CLUSTER_FAILED', label: 'Cluster Failed', category: 'Cluster' },
        { value: 'CLUSTER_READY', label: 'Cluster Ready', category: 'Cluster' },
        { value: 'CLUSTER_DEGRADED', label: 'Cluster Degraded', category: 'Cluster' },
        // Backup events
        { value: 'BACKUP_STARTED', label: 'Backup Started', category: 'Backup' },
        { value: 'BACKUP_COMPLETED', label: 'Backup Completed', category: 'Backup' },
        { value: 'BACKUP_FAILED', label: 'Backup Failed', category: 'Backup' },
        { value: 'BACKUP_DELETED', label: 'Backup Deleted', category: 'Backup' },
        // Restore events
        { value: 'RESTORE_STARTED', label: 'Restore Started', category: 'Restore' },
        { value: 'RESTORE_COMPLETED', label: 'Restore Completed', category: 'Restore' },
        { value: 'RESTORE_FAILED', label: 'Restore Failed', category: 'Restore' },
        // User events
        { value: 'USER_INVITED', label: 'User Invited', category: 'Team' },
        { value: 'USER_JOINED', label: 'User Joined', category: 'Team' },
        { value: 'USER_REMOVED', label: 'User Removed', category: 'Team' },
      ],
    };
  }

  @Get('severities')
  @ApiOperation({ summary: 'Get available severity levels' })
  getSeverityLevels() {
    return {
      success: true,
      data: [
        { value: 'info', label: 'Information', color: 'blue' },
        { value: 'warning', label: 'Warning', color: 'yellow' },
        { value: 'error', label: 'Error', color: 'red' },
      ],
    };
  }
}




