import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { EventsService } from './events.service';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('cluster/:clusterId')
  @ApiOperation({ summary: 'Get events for a cluster' })
  async findByCluster(
    @Param('clusterId') clusterId: string,
    @Query('limit') limit?: number,
  ) {
    const events = await this.eventsService.findByCluster(clusterId, limit || 50);
    return {
      success: true,
      data: events,
    };
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get events for a project' })
  async findByProject(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: number,
  ) {
    const events = await this.eventsService.findByProject(projectId, limit || 50);
    return {
      success: true,
      data: events,
    };
  }

  @Get('org/:orgId')
  @ApiOperation({ summary: 'Get events for an organization' })
  async findByOrg(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: number,
  ) {
    const events = await this.eventsService.findByOrg(orgId, limit || 100);
    return {
      success: true,
      data: events,
    };
  }
}




