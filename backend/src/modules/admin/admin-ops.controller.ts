import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { GlobalAdminGuard } from './guards/global-admin.guard';
import { AdminOpsService } from './admin-ops.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, GlobalAdminGuard)
export class AdminOpsController {
  constructor(private readonly adminOps: AdminOpsService) {}

  @Get('clusters')
  @ApiOperation({ summary: 'All clusters across all organizations' })
  async listClusters(@Query('status') status?: string, @Query('orgId') orgId?: string) {
    return { success: true, data: await this.adminOps.listClusters({ status, orgId }) };
  }

  @Get('diagnostics')
  @ApiOperation({ summary: 'Platform health: nodes, unhealthy pods, long-running and stuck jobs, backup freshness' })
  async diagnostics() {
    return { success: true, data: await this.adminOps.diagnostics() };
  }

  @Get('clusters/:clusterId/connections')
  @ApiOperation({ summary: 'External client IPs connected to a cluster, next to its IP access list' })
  async connections(@Param('clusterId') clusterId: string) {
    return { success: true, data: await this.adminOps.clusterConnections(clusterId) };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Control-plane jobs (create/delete/backup/restore/migrate …)' })
  async listJobs(
    @Query('status') status?: string,
    @Query('clusterId') clusterId?: string,
    @Query('limit') limit?: string,
  ) {
    return { success: true, data: await this.adminOps.listJobs({ status, clusterId, limit: limit ? Number(limit) : undefined }) };
  }

  @Post('jobs/:jobId/retry')
  @ApiOperation({ summary: 'Re-queue a failed or stuck job' })
  async retryJob(@Param('jobId') jobId: string) {
    return { success: true, data: await this.adminOps.retryJob(jobId) };
  }

  @Post('jobs/:jobId/fail')
  @ApiOperation({ summary: 'Mark a stuck job as failed (no retry)' })
  async failJob(@Param('jobId') jobId: string, @Body() body: { reason?: string }) {
    return { success: true, data: await this.adminOps.failJob(jobId, body?.reason) };
  }
}
