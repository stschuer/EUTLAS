import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto, AcknowledgeAlertDto } from './dto/create-alert.dto';
import { AlertStatus } from './schemas/alert-history.schema';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly orgsService: OrgsService,
  ) {}

  // ==================== Alert Rules ====================

  @Post('rules')
  @ApiOperation({ summary: 'Create an alert rule' })
  async createRule(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateAlertRuleDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const rule = await this.alertsService.createRule(orgId, user.userId, createDto);

    return {
      success: true,
      data: rule,
      message: 'Alert rule created',
    };
  }

  @Get('rules')
  @ApiOperation({ summary: 'List alert rules' })
  @ApiQuery({ name: 'enabled', required: false, type: Boolean })
  async findRules(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Query('enabled') enabled?: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const enabledFilter = enabled === 'true' ? true : enabled === 'false' ? false : undefined;
    const rules = await this.alertsService.findRulesByOrg(orgId, enabledFilter);

    return {
      success: true,
      data: rules,
    };
  }

  @Get('rules/:ruleId')
  @ApiOperation({ summary: 'Get alert rule details' })
  async findRule(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('ruleId') ruleId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const rule = await this.alertsService.findRuleById(ruleId);
    if (!rule || rule.orgId.toString() !== orgId) {
      throw new NotFoundException('Alert rule not found');
    }

    return {
      success: true,
      data: rule,
    };
  }

  @Patch('rules/:ruleId')
  @ApiOperation({ summary: 'Update an alert rule' })
  async updateRule(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('ruleId') ruleId: string,
    @Body() updateDto: UpdateAlertRuleDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const rule = await this.alertsService.findRuleById(ruleId);
    if (!rule || rule.orgId.toString() !== orgId) {
      throw new NotFoundException('Alert rule not found');
    }

    const updated = await this.alertsService.updateRule(ruleId, updateDto);

    return {
      success: true,
      data: updated,
    };
  }

  @Delete('rules/:ruleId')
  @ApiOperation({ summary: 'Delete an alert rule' })
  async deleteRule(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('ruleId') ruleId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const rule = await this.alertsService.findRuleById(ruleId);
    if (!rule || rule.orgId.toString() !== orgId) {
      throw new NotFoundException('Alert rule not found');
    }

    await this.alertsService.deleteRule(ruleId);

    return {
      success: true,
      message: 'Alert rule deleted',
    };
  }

  // ==================== Alert History ====================

  @Get('history')
  @ApiOperation({ summary: 'Get alert history' })
  @ApiQuery({ name: 'status', required: false, enum: ['firing', 'resolved', 'acknowledged'] })
  @ApiQuery({ name: 'clusterId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAlerts(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Query('status') status?: AlertStatus,
    @Query('clusterId') clusterId?: string,
    @Query('limit') limit?: number,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const alerts = await this.alertsService.findAlertsByOrg(orgId, {
      status,
      clusterId,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    return {
      success: true,
      data: alerts,
    };
  }

  @Get('history/stats')
  @ApiOperation({ summary: 'Get alert statistics' })
  async getStats(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const stats = await this.alertsService.getAlertStats(orgId);

    return {
      success: true,
      data: stats,
    };
  }

  @Get('history/:alertId')
  @ApiOperation({ summary: 'Get alert details' })
  async findAlert(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('alertId') alertId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const alert = await this.alertsService.findAlertById(alertId);
    if (!alert || alert.orgId.toString() !== orgId) {
      throw new NotFoundException('Alert not found');
    }

    return {
      success: true,
      data: alert,
    };
  }

  @Post('history/:alertId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  async acknowledgeAlert(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('alertId') alertId: string,
    @Body() acknowledgeDto: AcknowledgeAlertDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const alert = await this.alertsService.findAlertById(alertId);
    if (!alert || alert.orgId.toString() !== orgId) {
      throw new NotFoundException('Alert not found');
    }

    const updated = await this.alertsService.acknowledgeAlert(
      alertId,
      user.userId,
      acknowledgeDto,
    );

    return {
      success: true,
      data: updated,
      message: 'Alert acknowledged',
    };
  }

  @Post('history/:alertId/resolve')
  @ApiOperation({ summary: 'Manually resolve an alert' })
  async resolveAlert(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('alertId') alertId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const alert = await this.alertsService.findAlertById(alertId);
    if (!alert || alert.orgId.toString() !== orgId) {
      throw new NotFoundException('Alert not found');
    }

    const updated = await this.alertsService.resolveAlert(alertId);

    return {
      success: true,
      data: updated,
      message: 'Alert resolved',
    };
  }
}



