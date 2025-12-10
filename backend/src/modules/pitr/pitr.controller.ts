import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PitrService } from './pitr.service';
import { EnablePitrDto, UpdatePitrConfigDto, CreatePitrRestoreDto } from './dto/pitr.dto';

@ApiTags('Point-in-Time Recovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/pitr')
export class PitrController {
  constructor(private readonly pitrService: PitrService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get PITR configuration for a cluster' })
  async getConfig(@Param('clusterId') clusterId: string) {
    const config = await this.pitrService.getPitrConfig(clusterId);
    return {
      success: true,
      data: config || { enabled: false },
    };
  }

  @Post('enable')
  @ApiOperation({ summary: 'Enable PITR for a cluster' })
  async enablePitr(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: EnablePitrDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // In production, get orgId from project
    const orgId = user.userId; // Placeholder - should be fetched from project
    const config = await this.pitrService.enablePitr(clusterId, orgId, projectId, dto);
    return {
      success: true,
      data: config,
      message: 'Point-in-Time Recovery enabled successfully',
    };
  }

  @Post('disable')
  @ApiOperation({ summary: 'Disable PITR for a cluster' })
  async disablePitr(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId;
    const config = await this.pitrService.disablePitr(clusterId, orgId, projectId);
    return {
      success: true,
      data: config,
      message: 'Point-in-Time Recovery disabled successfully',
    };
  }

  @Put('config')
  @ApiOperation({ summary: 'Update PITR configuration' })
  async updateConfig(
    @Param('clusterId') clusterId: string,
    @Body() dto: UpdatePitrConfigDto,
  ) {
    const config = await this.pitrService.updatePitrConfig(clusterId, dto);
    return {
      success: true,
      data: config,
    };
  }

  @Get('window')
  @ApiOperation({ summary: 'Get restore window (available time range for restore)' })
  async getRestoreWindow(@Param('clusterId') clusterId: string) {
    const window = await this.pitrService.getRestoreWindow(clusterId);
    return {
      success: true,
      data: window,
    };
  }

  @Get('oplog/stats')
  @ApiOperation({ summary: 'Get oplog statistics' })
  async getOplogStats(@Param('clusterId') clusterId: string) {
    const stats = await this.pitrService.getOplogStats(clusterId);
    return {
      success: true,
      data: stats,
    };
  }

  @Post('restore')
  @ApiOperation({ summary: 'Initiate a point-in-time restore' })
  async createRestore(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: CreatePitrRestoreDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId;
    const restore = await this.pitrService.createRestore(
      clusterId,
      orgId,
      projectId,
      user.userId,
      dto,
    );
    return {
      success: true,
      data: restore,
      message: 'Point-in-Time restore initiated',
    };
  }

  @Get('restore/:restoreId')
  @ApiOperation({ summary: 'Get restore status' })
  async getRestore(@Param('restoreId') restoreId: string) {
    const restore = await this.pitrService.getRestore(restoreId);
    if (!restore) {
      throw new NotFoundException('Restore not found');
    }
    return {
      success: true,
      data: restore,
    };
  }

  @Get('restore')
  @ApiOperation({ summary: 'Get restore history' })
  async getRestoreHistory(@Param('clusterId') clusterId: string) {
    const restores = await this.pitrService.getRestoreHistory(clusterId);
    return {
      success: true,
      data: restores,
    };
  }

  @Delete('restore/:restoreId')
  @ApiOperation({ summary: 'Cancel an in-progress restore' })
  async cancelRestore(@Param('restoreId') restoreId: string) {
    const restore = await this.pitrService.cancelRestore(restoreId);
    return {
      success: true,
      data: restore,
      message: 'Restore cancelled',
    };
  }
}

