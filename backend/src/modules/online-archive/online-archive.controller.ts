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
import { OnlineArchiveService } from './online-archive.service';
import { CreateArchiveRuleDto, UpdateArchiveRuleDto } from './dto/archive.dto';

@ApiTags('Online Archive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/archive')
export class OnlineArchiveController {
  constructor(private readonly archiveService: OnlineArchiveService) {}

  @Post('rules')
  @ApiOperation({ summary: 'Create archive rule' })
  async create(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: CreateArchiveRuleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId;
    const rule = await this.archiveService.create(clusterId, projectId, orgId, user.userId, dto);
    return { success: true, data: rule };
  }

  @Get('rules')
  @ApiOperation({ summary: 'List archive rules' })
  async findAll(@Param('clusterId') clusterId: string) {
    const rules = await this.archiveService.findAllByCluster(clusterId);
    return { success: true, data: rules };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get archive statistics' })
  async getStats(@Param('clusterId') clusterId: string) {
    const stats = await this.archiveService.getStats(clusterId);
    return { success: true, data: stats };
  }

  @Get('rules/:ruleId')
  @ApiOperation({ summary: 'Get archive rule details' })
  async findOne(@Param('ruleId') ruleId: string) {
    const rule = await this.archiveService.findById(ruleId);
    if (!rule) throw new NotFoundException('Archive rule not found');
    return { success: true, data: rule };
  }

  @Patch('rules/:ruleId')
  @ApiOperation({ summary: 'Update archive rule' })
  async update(@Param('ruleId') ruleId: string, @Body() dto: UpdateArchiveRuleDto) {
    const rule = await this.archiveService.update(ruleId, dto);
    return { success: true, data: rule };
  }

  @Delete('rules/:ruleId')
  @ApiOperation({ summary: 'Delete archive rule' })
  async delete(@Param('ruleId') ruleId: string) {
    await this.archiveService.delete(ruleId);
    return { success: true, message: 'Archive rule deleted' };
  }

  @Post('rules/:ruleId/pause')
  @ApiOperation({ summary: 'Pause archive rule' })
  async pause(@Param('ruleId') ruleId: string) {
    const rule = await this.archiveService.pause(ruleId);
    return { success: true, data: rule };
  }

  @Post('rules/:ruleId/resume')
  @ApiOperation({ summary: 'Resume archive rule' })
  async resume(@Param('ruleId') ruleId: string) {
    const rule = await this.archiveService.resume(ruleId);
    return { success: true, data: rule };
  }

  @Post('rules/:ruleId/run')
  @ApiOperation({ summary: 'Run archive now' })
  async runNow(@Param('ruleId') ruleId: string) {
    const result = await this.archiveService.runNow(ruleId);
    return { success: true, data: result, message: 'Archive completed' };
  }
}


