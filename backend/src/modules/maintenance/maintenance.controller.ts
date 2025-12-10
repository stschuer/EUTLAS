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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { MaintenanceService } from './maintenance.service';
import {
  CreateMaintenanceWindowDto,
  UpdateMaintenanceWindowDto,
  DeferMaintenanceDto,
  ScheduleEmergencyMaintenanceDto,
} from './dto/maintenance.dto';

@ApiTags('Maintenance Windows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  @ApiOperation({ summary: 'Create maintenance window' })
  async create(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: CreateMaintenanceWindowDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId; // Placeholder
    const window = await this.maintenanceService.create(
      clusterId,
      projectId,
      orgId,
      user.userId,
      dto,
    );
    return {
      success: true,
      data: window,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List maintenance windows' })
  @ApiQuery({ name: 'includeHistory', required: false, type: Boolean })
  async findAll(
    @Param('clusterId') clusterId: string,
    @Query('includeHistory') includeHistory?: string,
  ) {
    const windows = await this.maintenanceService.findAllByCluster(
      clusterId,
      includeHistory === 'true',
    );
    return {
      success: true,
      data: windows,
    };
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming maintenance windows' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getUpcoming(
    @Param('clusterId') clusterId: string,
    @Query('days') days?: number,
  ) {
    const windows = await this.maintenanceService.getUpcoming(clusterId, days || 30);
    return {
      success: true,
      data: windows,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get maintenance history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(
    @Param('clusterId') clusterId: string,
    @Query('limit') limit?: number,
  ) {
    const windows = await this.maintenanceService.getHistory(clusterId, limit || 10);
    return {
      success: true,
      data: windows,
    };
  }

  @Get(':windowId')
  @ApiOperation({ summary: 'Get maintenance window details' })
  async findOne(@Param('windowId') windowId: string) {
    const window = await this.maintenanceService.findById(windowId);
    if (!window) {
      throw new NotFoundException('Maintenance window not found');
    }
    return {
      success: true,
      data: window,
    };
  }

  @Patch(':windowId')
  @ApiOperation({ summary: 'Update maintenance window' })
  async update(
    @Param('windowId') windowId: string,
    @Body() dto: UpdateMaintenanceWindowDto,
  ) {
    const window = await this.maintenanceService.update(windowId, dto);
    return {
      success: true,
      data: window,
    };
  }

  @Delete(':windowId')
  @ApiOperation({ summary: 'Cancel maintenance window' })
  async cancel(
    @Param('windowId') windowId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const window = await this.maintenanceService.cancel(windowId, user.userId, body.reason);
    return {
      success: true,
      data: window,
    };
  }

  @Post(':windowId/defer')
  @ApiOperation({ summary: 'Defer maintenance window' })
  async defer(
    @Param('windowId') windowId: string,
    @Body() dto: DeferMaintenanceDto,
  ) {
    const window = await this.maintenanceService.defer(windowId, dto);
    return {
      success: true,
      data: window,
      message: `Maintenance deferred by ${dto.days} days`,
    };
  }

  @Post('emergency')
  @ApiOperation({ summary: 'Schedule emergency maintenance' })
  async scheduleEmergency(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: ScheduleEmergencyMaintenanceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId; // Placeholder
    const window = await this.maintenanceService.scheduleEmergency(
      clusterId,
      projectId,
      orgId,
      user.userId,
      dto,
    );
    return {
      success: true,
      data: window,
    };
  }
}


