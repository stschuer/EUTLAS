import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { ClusterSettingsService } from './cluster-settings.service';
import {
  UpdateClusterSettingsDto,
  AddScheduledScalingDto,
  UpdateTagsDto,
  UpdateLabelsDto,
} from './dto/cluster-settings.dto';

@ApiTags('Cluster Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/settings')
export class ClusterSettingsController {
  constructor(private readonly settingsService: ClusterSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get cluster settings' })
  async get(@Param('clusterId') clusterId: string) {
    const settings = await this.settingsService.getOrCreate(clusterId);
    return { success: true, data: settings };
  }

  @Patch()
  @ApiOperation({ summary: 'Update cluster settings' })
  async update(
    @Param('clusterId') clusterId: string,
    @Body() dto: UpdateClusterSettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId; // Placeholder
    const settings = await this.settingsService.update(clusterId, dto, user.userId, orgId);
    return { success: true, data: settings };
  }

  // Tags
  @Get('tags')
  @ApiOperation({ summary: 'Get cluster tags' })
  async getTags(@Param('clusterId') clusterId: string) {
    const settings = await this.settingsService.getOrCreate(clusterId);
    return { success: true, data: Object.fromEntries(settings.tags) };
  }

  @Patch('tags')
  @ApiOperation({ summary: 'Update cluster tags' })
  async updateTags(@Param('clusterId') clusterId: string, @Body() dto: UpdateTagsDto) {
    const settings = await this.settingsService.updateTags(clusterId, dto.tags);
    return { success: true, data: Object.fromEntries(settings.tags) };
  }

  @Post('tags/:key')
  @ApiOperation({ summary: 'Add a tag' })
  async addTag(
    @Param('clusterId') clusterId: string,
    @Param('key') key: string,
    @Body() body: { value: string },
  ) {
    const settings = await this.settingsService.addTag(clusterId, key, body.value);
    return { success: true, data: Object.fromEntries(settings.tags) };
  }

  @Delete('tags/:key')
  @ApiOperation({ summary: 'Remove a tag' })
  async removeTag(@Param('clusterId') clusterId: string, @Param('key') key: string) {
    const settings = await this.settingsService.removeTag(clusterId, key);
    return { success: true, data: Object.fromEntries(settings.tags) };
  }

  // Labels
  @Get('labels')
  @ApiOperation({ summary: 'Get cluster labels' })
  async getLabels(@Param('clusterId') clusterId: string) {
    const settings = await this.settingsService.getOrCreate(clusterId);
    return { success: true, data: settings.labels };
  }

  @Patch('labels')
  @ApiOperation({ summary: 'Update cluster labels' })
  async updateLabels(@Param('clusterId') clusterId: string, @Body() dto: UpdateLabelsDto) {
    const settings = await this.settingsService.updateLabels(clusterId, dto.labels);
    return { success: true, data: settings.labels };
  }

  // Connection Pool
  @Get('connection-pool')
  @ApiOperation({ summary: 'Get connection pool settings' })
  async getConnectionPool(@Param('clusterId') clusterId: string) {
    const settings = await this.settingsService.getOrCreate(clusterId);
    return { success: true, data: settings.connectionPool };
  }

  // Scheduled Scaling
  @Get('scheduled-scaling')
  @ApiOperation({ summary: 'Get scheduled scaling rules' })
  async getScheduledScaling(@Param('clusterId') clusterId: string) {
    const settings = await this.settingsService.getOrCreate(clusterId);
    return { success: true, data: settings.scheduledScaling };
  }

  @Post('scheduled-scaling')
  @ApiOperation({ summary: 'Add scheduled scaling rule' })
  async addScheduledScaling(
    @Param('clusterId') clusterId: string,
    @Body() dto: AddScheduledScalingDto,
  ) {
    const settings = await this.settingsService.addScheduledScaling(clusterId, dto);
    return { success: true, data: settings.scheduledScaling };
  }

  @Patch('scheduled-scaling/:scheduleId')
  @ApiOperation({ summary: 'Update scheduled scaling rule' })
  async updateScheduledScaling(
    @Param('clusterId') clusterId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: Partial<AddScheduledScalingDto>,
  ) {
    const settings = await this.settingsService.updateScheduledScaling(clusterId, scheduleId, dto);
    return { success: true, data: settings.scheduledScaling };
  }

  @Delete('scheduled-scaling/:scheduleId')
  @ApiOperation({ summary: 'Delete scheduled scaling rule' })
  async deleteScheduledScaling(
    @Param('clusterId') clusterId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    const settings = await this.settingsService.removeScheduledScaling(clusterId, scheduleId);
    return { success: true, data: settings.scheduledScaling };
  }
}


