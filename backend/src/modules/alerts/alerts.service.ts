import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertRule, AlertRuleDocument, AlertMetricType, AlertCondition, AlertSeverity } from './schemas/alert-rule.schema';
import { AlertHistory, AlertHistoryDocument, AlertStatus } from './schemas/alert-history.schema';
import { CreateAlertRuleDto, UpdateAlertRuleDto, AcknowledgeAlertDto } from './dto/create-alert.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(AlertRule.name) private alertRuleModel: Model<AlertRuleDocument>,
    @InjectModel(AlertHistory.name) private alertHistoryModel: Model<AlertHistoryDocument>,
    private readonly eventsService: EventsService,
  ) {}

  // ==================== Alert Rules ====================

  async createRule(
    orgId: string,
    userId: string,
    createDto: CreateAlertRuleDto,
  ): Promise<AlertRule> {
    const rule = new this.alertRuleModel({
      orgId,
      name: createDto.name,
      description: createDto.description,
      clusterId: createDto.clusterId,
      metricType: createDto.metricType as AlertMetricType,
      condition: createDto.condition as AlertCondition,
      threshold: createDto.threshold,
      severity: (createDto.severity || 'warning') as AlertSeverity,
      evaluationPeriodMinutes: createDto.evaluationPeriodMinutes || 5,
      cooldownMinutes: createDto.cooldownMinutes || 60,
      notificationChannels: createDto.notificationChannels?.map(id => new Types.ObjectId(id)) || [],
      enabled: createDto.enabled !== false,
      createdBy: new Types.ObjectId(userId),
    });

    await rule.save();
    this.logger.log(`Created alert rule "${createDto.name}" for org ${orgId}`);
    return rule;
  }

  async findRulesByOrg(orgId: string, enabled?: boolean): Promise<AlertRule[]> {
    const query: any = { orgId };
    if (enabled !== undefined) {
      query.enabled = enabled;
    }
    return this.alertRuleModel
      .find(query)
      .populate('notificationChannels', 'name type')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findRuleById(ruleId: string): Promise<AlertRuleDocument | null> {
    return this.alertRuleModel.findById(ruleId).exec();
  }

  async findRulesForCluster(orgId: string, clusterId: string): Promise<AlertRule[]> {
    return this.alertRuleModel.find({
      orgId,
      enabled: true,
      $or: [
        { clusterId: null },
        { clusterId: { $exists: false } },
        { clusterId },
      ],
    }).exec();
  }

  async updateRule(ruleId: string, updateDto: UpdateAlertRuleDto): Promise<AlertRule> {
    const rule = await this.findRuleById(ruleId);
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    if (updateDto.name !== undefined) rule.name = updateDto.name;
    if (updateDto.description !== undefined) rule.description = updateDto.description;
    if (updateDto.threshold !== undefined) rule.threshold = updateDto.threshold;
    if (updateDto.severity !== undefined) rule.severity = updateDto.severity as AlertSeverity;
    if (updateDto.evaluationPeriodMinutes !== undefined) rule.evaluationPeriodMinutes = updateDto.evaluationPeriodMinutes;
    if (updateDto.cooldownMinutes !== undefined) rule.cooldownMinutes = updateDto.cooldownMinutes;
    if (updateDto.notificationChannels !== undefined) {
      rule.notificationChannels = updateDto.notificationChannels.map(id => new Types.ObjectId(id)) as any;
    }
    if (updateDto.enabled !== undefined) rule.enabled = updateDto.enabled;

    await rule.save();
    return rule;
  }

  async deleteRule(ruleId: string): Promise<void> {
    const result = await this.alertRuleModel.findByIdAndDelete(ruleId).exec();
    if (!result) {
      throw new NotFoundException('Alert rule not found');
    }
  }

  // ==================== Alert History ====================

  async createAlert(
    rule: AlertRuleDocument,
    clusterId: string,
    currentValue: number,
  ): Promise<AlertHistory> {
    // Check cooldown
    if (rule.lastTriggeredAt) {
      const cooldownEnd = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000);
      if (new Date() < cooldownEnd) {
        this.logger.debug(`Alert rule ${rule.id} is in cooldown`);
        return null as any;
      }
    }

    const message = this.generateAlertMessage(rule, currentValue);

    const alert = new this.alertHistoryModel({
      alertRuleId: rule._id,
      orgId: rule.orgId,
      clusterId: new Types.ObjectId(clusterId),
      alertName: rule.name,
      metricType: rule.metricType,
      severity: rule.severity,
      status: 'firing' as AlertStatus,
      threshold: rule.threshold,
      currentValue,
      message,
      firedAt: new Date(),
    });

    await alert.save();

    // Update last triggered time
    rule.lastTriggeredAt = new Date();
    await rule.save();

    // Log event
    await this.eventsService.createEvent({
      orgId: rule.orgId.toString(),
      clusterId,
      type: 'CLUSTER_DEGRADED',
      severity: rule.severity === 'critical' ? 'error' : 'warning',
      message: `Alert: ${rule.name} - ${message}`,
      metadata: { alertId: alert.id, metricType: rule.metricType, currentValue, threshold: rule.threshold },
    });

    this.logger.warn(`Alert fired: ${rule.name} for cluster ${clusterId}`);
    return alert;
  }

  async resolveAlert(alertId: string): Promise<AlertHistory> {
    const alert = await this.alertHistoryModel.findByIdAndUpdate(
      alertId,
      {
        $set: {
          status: 'resolved' as AlertStatus,
          resolvedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    this.logger.log(`Alert ${alertId} resolved`);
    return alert;
  }

  async acknowledgeAlert(
    alertId: string,
    userId: string,
    acknowledgeDto: AcknowledgeAlertDto,
  ): Promise<AlertHistory> {
    const alert = await this.alertHistoryModel.findByIdAndUpdate(
      alertId,
      {
        $set: {
          status: 'acknowledged' as AlertStatus,
          acknowledgedAt: new Date(),
          acknowledgedBy: new Types.ObjectId(userId),
          acknowledgeNote: acknowledgeDto.note,
        },
      },
      { new: true },
    ).exec();

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    this.logger.log(`Alert ${alertId} acknowledged by ${userId}`);
    return alert;
  }

  async findAlertsByOrg(
    orgId: string,
    options?: { status?: AlertStatus; limit?: number; clusterId?: string },
  ): Promise<AlertHistory[]> {
    const query: any = { orgId };
    
    if (options?.status) {
      query.status = options.status;
    }
    if (options?.clusterId) {
      query.clusterId = options.clusterId;
    }

    return this.alertHistoryModel
      .find(query)
      .populate('alertRuleId', 'name')
      .populate('acknowledgedBy', 'firstName lastName email')
      .sort({ firedAt: -1 })
      .limit(options?.limit || 100)
      .exec();
  }

  async findAlertById(alertId: string): Promise<AlertHistoryDocument | null> {
    return this.alertHistoryModel.findById(alertId).exec();
  }

  async getAlertStats(orgId: string): Promise<{
    totalFiring: number;
    totalAcknowledged: number;
    totalResolved24h: number;
    bySeverity: Record<string, number>;
  }> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [firing, acknowledged, resolved24h, bySeverity] = await Promise.all([
      this.alertHistoryModel.countDocuments({ orgId, status: 'firing' }).exec(),
      this.alertHistoryModel.countDocuments({ orgId, status: 'acknowledged' }).exec(),
      this.alertHistoryModel.countDocuments({ 
        orgId, 
        status: 'resolved',
        resolvedAt: { $gte: yesterday },
      }).exec(),
      this.alertHistoryModel.aggregate([
        { $match: { orgId: new Types.ObjectId(orgId), status: 'firing' } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]).exec(),
    ]);

    const severityMap: Record<string, number> = { info: 0, warning: 0, critical: 0 };
    bySeverity.forEach((item: any) => {
      severityMap[item._id] = item.count;
    });

    return {
      totalFiring: firing,
      totalAcknowledged: acknowledged,
      totalResolved24h: resolved24h,
      bySeverity: severityMap,
    };
  }

  async markNotificationSent(alertId: string, channelId: string): Promise<void> {
    await this.alertHistoryModel.findByIdAndUpdate(alertId, {
      $addToSet: { notificationsSent: channelId },
    }).exec();
  }

  private generateAlertMessage(rule: AlertRuleDocument, currentValue: number): string {
    const conditionText: Record<string, string> = {
      gt: 'is greater than',
      gte: 'is at or above',
      lt: 'is less than',
      lte: 'is at or below',
      eq: 'equals',
    };

    const metricUnit: Record<string, string> = {
      cpu_usage: '%',
      memory_usage: '%',
      storage_usage: '%',
      connections: '',
      replication_lag: 'ms',
      operations_per_sec: ' ops/s',
      query_latency: 'ms',
    };

    const unit = metricUnit[rule.metricType] || '';
    return `${rule.metricType.replace(/_/g, ' ')} ${conditionText[rule.condition]} ${rule.threshold}${unit} (current: ${currentValue.toFixed(1)}${unit})`;
  }
}




