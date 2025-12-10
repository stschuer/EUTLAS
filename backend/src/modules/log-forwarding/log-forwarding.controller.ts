import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { LogForwardingService } from './log-forwarding.service';
import { CreateLogForwardingDto, UpdateLogForwardingDto } from './dto/log-forwarding.dto';

@ApiTags('Log Forwarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/log-forwarding')
export class LogForwardingController {
  constructor(private readonly logForwardingService: LogForwardingService) {}

  @Post()
  @ApiOperation({ summary: 'Create log forwarding configuration' })
  async create(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: CreateLogForwardingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId; // Placeholder
    const config = await this.logForwardingService.create(
      clusterId,
      projectId,
      orgId,
      user.userId,
      dto,
    );
    return {
      success: true,
      data: config,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List log forwarding configurations' })
  async findAll(@Param('clusterId') clusterId: string) {
    const configs = await this.logForwardingService.findAllByCluster(clusterId);
    return {
      success: true,
      data: configs,
    };
  }

  @Get('destinations')
  @ApiOperation({ summary: 'Get supported log destinations' })
  async getDestinations() {
    const destinations = this.logForwardingService.getSupportedDestinations();
    return {
      success: true,
      data: destinations,
    };
  }

  @Get(':configId')
  @ApiOperation({ summary: 'Get log forwarding configuration' })
  async findOne(@Param('configId') configId: string) {
    const config = await this.logForwardingService.findById(configId);
    if (!config) {
      throw new NotFoundException('Configuration not found');
    }
    return {
      success: true,
      data: config,
    };
  }

  @Patch(':configId')
  @ApiOperation({ summary: 'Update log forwarding configuration' })
  async update(
    @Param('configId') configId: string,
    @Body() dto: UpdateLogForwardingDto,
  ) {
    const config = await this.logForwardingService.update(configId, dto);
    return {
      success: true,
      data: config,
    };
  }

  @Delete(':configId')
  @ApiOperation({ summary: 'Delete log forwarding configuration' })
  async delete(@Param('configId') configId: string) {
    await this.logForwardingService.delete(configId);
    return {
      success: true,
      message: 'Configuration deleted',
    };
  }

  @Post(':configId/toggle')
  @ApiOperation({ summary: 'Enable or disable log forwarding' })
  async toggle(
    @Param('configId') configId: string,
    @Body() body: { enabled: boolean },
  ) {
    const config = await this.logForwardingService.toggle(configId, body.enabled);
    return {
      success: true,
      data: config,
    };
  }

  @Post(':configId/test')
  @ApiOperation({ summary: 'Test log forwarding connection' })
  async testConnection(@Param('configId') configId: string) {
    const result = await this.logForwardingService.testConnection(configId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':configId/stats')
  @ApiOperation({ summary: 'Get log forwarding statistics' })
  async getStats(@Param('configId') configId: string) {
    const stats = await this.logForwardingService.getStats(configId);
    return {
      success: true,
      data: stats,
    };
  }
}


