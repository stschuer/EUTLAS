import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { ScalingService } from './scaling.service';
import { AutoScalingService } from './auto-scaling.service';

@ApiTags('Scaling Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/scaling')
export class ScalingController {
  constructor(
    private readonly scalingService: ScalingService,
    private readonly autoScalingService: AutoScalingService,
  ) {}

  @Get('recommendations')
  @ApiOperation({ summary: 'Get active scaling recommendations' })
  async getRecommendations(@Param('clusterId') clusterId: string) {
    const recommendations = await this.scalingService.getRecommendations(clusterId);
    return {
      success: true,
      data: recommendations,
    };
  }

  @Get('recommendations/history')
  @ApiOperation({ summary: 'Get recommendation history' })
  async getHistory(
    @Param('clusterId') clusterId: string,
    @Query('limit') limit?: number,
  ) {
    const recommendations = await this.scalingService.getRecommendationHistory(clusterId, limit || 20);
    return {
      success: true,
      data: recommendations,
    };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Trigger scaling analysis for cluster' })
  async analyzeCluster(@Param('clusterId') clusterId: string) {
    const recommendation = await this.scalingService.analyzeCluster(clusterId);
    return {
      success: true,
      data: recommendation,
      message: recommendation 
        ? 'Analysis complete - recommendation generated'
        : 'Analysis complete - no action needed',
    };
  }

  @Post('recommendations/:recommendationId/apply')
  @ApiOperation({ summary: 'Apply a scaling recommendation' })
  async applyRecommendation(
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const recommendation = await this.scalingService.applyRecommendation(
      recommendationId,
      user.userId,
    );
    return {
      success: true,
      data: recommendation,
      message: 'Recommendation applied - cluster resize initiated',
    };
  }

  @Post('recommendations/:recommendationId/dismiss')
  @ApiOperation({ summary: 'Dismiss a scaling recommendation' })
  async dismissRecommendation(
    @Param('recommendationId') recommendationId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const recommendation = await this.scalingService.dismissRecommendation(
      recommendationId,
      user.userId,
      body.reason,
    );
    return {
      success: true,
      data: recommendation,
      message: 'Recommendation dismissed',
    };
  }

  // Auto-scaling endpoints
  @Get('auto-scaling/config')
  @ApiOperation({ summary: 'Get auto-scaling configuration' })
  async getAutoScalingConfig(@Param('clusterId') clusterId: string) {
    const config = await this.autoScalingService.getAutoScalingConfig(clusterId);
    return { success: true, data: config };
  }

  @Post('auto-scaling/enable')
  @ApiOperation({ summary: 'Enable auto-scaling' })
  async enableAutoScaling(
    @Param('clusterId') clusterId: string,
    @Body() body: {
      minPlan?: string;
      maxPlan?: string;
      scaleUpThreshold?: number;
      scaleDownThreshold?: number;
      cooldownMinutes?: number;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.autoScalingService.enableAutoScaling(clusterId, body, user.userId);
    return { success: true, message: 'Auto-scaling enabled' };
  }

  @Post('auto-scaling/disable')
  @ApiOperation({ summary: 'Disable auto-scaling' })
  async disableAutoScaling(
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.autoScalingService.disableAutoScaling(clusterId, user.userId);
    return { success: true, message: 'Auto-scaling disabled' };
  }

  @Get('auto-scaling/history')
  @ApiOperation({ summary: 'Get auto-scaling history' })
  async getScalingHistory(@Param('clusterId') clusterId: string) {
    const history = await this.autoScalingService.getScalingHistory(clusterId);
    return { success: true, data: history };
  }

  @Post('auto-scaling/apply/:recommendationId')
  @ApiOperation({ summary: 'Apply a scaling recommendation manually' })
  async applyScalingRecommendation(
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.autoScalingService.applyRecommendation(recommendationId, user.userId);
    return { success: result.success, data: result };
  }
}

@ApiTags('Scaling Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/scaling')
export class OrgScalingController {
  constructor(private readonly scalingService: ScalingService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get scaling recommendation stats for organization' })
  async getStats(@Param('orgId') orgId: string) {
    const stats = await this.scalingService.getStats(orgId);
    return {
      success: true,
      data: stats,
    };
  }
}

