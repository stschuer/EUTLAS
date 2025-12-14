import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Query audit logs' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'clusterId', required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'actions', required: false, description: 'Comma-separated actions' })
  @ApiQuery({ name: 'resourceTypes', required: false, description: 'Comma-separated types' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async query(
    @Param('orgId') orgId: string,
    @Query('projectId') projectId?: string,
    @Query('clusterId') clusterId?: string,
    @Query('actorId') actorId?: string,
    @Query('actions') actions?: string,
    @Query('resourceTypes') resourceTypes?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.auditService.query({
      orgId,
      projectId,
      clusterId,
      actorId,
      actions: actions?.split(',') as any,
      resourceTypes: resourceTypes?.split(',') as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });

    return { success: true, ...result };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get audit statistics' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getStats(@Param('orgId') orgId: string, @Query('days') days?: string) {
    const stats = await this.auditService.getStats(orgId, days ? parseInt(days) : 30);
    return { success: true, data: stats };
  }

  @Get('actions')
  @ApiOperation({ summary: 'Get available audit actions' })
  async getActions() {
    const actions = await this.auditService.getActions();
    return { success: true, data: actions };
  }

  @Get('resource-types')
  @ApiOperation({ summary: 'Get available resource types' })
  async getResourceTypes() {
    const types = await this.auditService.getResourceTypes();
    return { success: true, data: types };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async export(
    @Param('orgId') orgId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('format') format: 'json' | 'csv' = 'json',
    @Res() res: Response,
  ) {
    const data = await this.auditService.exportLogs(
      orgId,
      new Date(startDate),
      new Date(endDate),
      format,
    );

    const filename = `audit-logs-${orgId}-${startDate}-${endDate}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.send(data);
  }

  @Get(':logId')
  @ApiOperation({ summary: 'Get audit log details' })
  async getById(@Param('logId') logId: string) {
    const log = await this.auditService.getById(logId);
    if (!log) throw new NotFoundException('Audit log not found');
    return { success: true, data: log };
  }
}




