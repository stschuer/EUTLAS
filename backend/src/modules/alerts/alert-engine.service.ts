import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlertsService } from './alerts.service';
import { NotificationService } from './notification.service';
import { AlertRuleDocument, AlertCondition } from './schemas/alert-rule.schema';
import { AlertHistory } from './schemas/alert-history.schema';
import { Cluster, ClusterDocument } from '../clusters/schemas/cluster.schema';
import { MetricsService, CurrentMetrics } from '../metrics/metrics.service';
import { OrgsService } from '../orgs/orgs.service';

interface MetricEvaluation {
  clusterId: string;
  clusterName: string;
  metricValue: number;
  conditionMet: boolean;
}

@Injectable()
export class AlertEngineService implements OnModuleInit {
  private readonly logger = new Logger(AlertEngineService.name);
  private isEvaluating = false;

  constructor(
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    private readonly alertsService: AlertsService,
    private readonly notificationService: NotificationService,
    private readonly metricsService: MetricsService,
    private readonly orgsService: OrgsService,
  ) {}

  onModuleInit() {
    this.logger.log('Alert Engine initialized');
  }

  @Interval(60000) // Evaluate every minute
  async evaluateAlerts() {
    if (this.isEvaluating) {
      return;
    }

    this.isEvaluating = true;

    try {
      // Get all enabled alert rules
      const orgs = await this.getOrgsWithAlerts();
      
      for (const orgId of orgs) {
        await this.evaluateOrgAlerts(orgId);
      }
    } catch (error: any) {
      this.logger.error(`Error evaluating alerts: ${error.message}`);
    } finally {
      this.isEvaluating = false;
    }
  }

  private async getOrgsWithAlerts(): Promise<string[]> {
    const rules = await this.alertsService.findRulesByOrg('', true); // This won't work, need to fix
    
    // Actually, let's get all enabled rules and extract unique orgIds
    const AlertRule = this.alertsService['alertRuleModel'];
    const orgs = await AlertRule.distinct('orgId', { enabled: true }).exec();
    return orgs.map((id: any) => id.toString());
  }

  private async evaluateOrgAlerts(orgId: string): Promise<void> {
    const rules = await this.alertsService.findRulesByOrg(orgId, true);
    
    if (rules.length === 0) {
      return;
    }

    // Get all active clusters for this org
    const clusters = await this.clusterModel.find({
      orgId,
      status: { $in: ['ready', 'degraded'] },
    }).exec();

    for (const rule of rules) {
      for (const cluster of clusters) {
        // Skip if rule is for a specific cluster and this isn't it
        if (rule.clusterId && rule.clusterId.toString() !== cluster._id.toString()) {
          continue;
        }

        await this.evaluateRuleForCluster(rule as AlertRuleDocument, cluster);
      }
    }
  }

  private async evaluateRuleForCluster(
    rule: AlertRuleDocument,
    cluster: ClusterDocument,
  ): Promise<void> {
    try {
      const metrics = await this.metricsService.getCurrentMetrics(cluster._id.toString());
      
      if (!metrics) {
        return;
      }

      const metricValue = this.getMetricValue(metrics, rule.metricType);
      if (metricValue === null) {
        return;
      }

      const conditionMet = this.evaluateCondition(metricValue, rule.condition, rule.threshold);

      if (conditionMet) {
        const alert = await this.alertsService.createAlert(rule, cluster._id.toString(), metricValue);
        
        if (alert) {
          // Send notifications
          await this.sendAlertNotifications(alert, rule, cluster);
        }
      } else {
        // Check if there's an active alert that should be resolved
        await this.checkAndResolveAlert(rule, cluster._id.toString());
      }
    } catch (error: any) {
      this.logger.error(`Error evaluating rule ${rule.id} for cluster ${cluster._id}: ${error.message}`);
    }
  }

  private getMetricValue(metrics: CurrentMetrics, metricType: string): number | null {
    const mapping: Record<string, keyof CurrentMetrics> = {
      cpu_usage: 'cpu',
      memory_usage: 'memory',
      storage_usage: 'storageUsed', // Need to calculate percentage
      connections: 'connectionsCurrent',
      operations_per_sec: 'operationsPerSec',
    };

    const key = mapping[metricType];
    if (!key) {
      return null;
    }

    let value = metrics[key] as number;

    // Calculate storage percentage
    if (metricType === 'storage_usage') {
      const total = metrics.storageUsed + metrics.storageAvailable;
      value = total > 0 ? (metrics.storageUsed / total) * 100 : 0;
    }

    return value;
  }

  private evaluateCondition(value: number, condition: AlertCondition, threshold: number): boolean {
    switch (condition) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return Math.abs(value - threshold) < 0.001;
      default:
        return false;
    }
  }

  private async sendAlertNotifications(
    alert: AlertHistory,
    rule: AlertRuleDocument,
    cluster: ClusterDocument,
  ): Promise<void> {
    if (rule.notificationChannels.length === 0) {
      return;
    }

    const org = await this.orgsService.findById(rule.orgId.toString());

    const payload = {
      alert,
      clusterName: cluster.name,
      orgName: org?.name || 'Unknown',
    };

    const channelIds = rule.notificationChannels.map(id => id.toString());
    const successfulChannels = await this.notificationService.sendToMultipleChannels(
      channelIds,
      payload,
    );

    // Mark notifications as sent
    for (const channelId of successfulChannels) {
      await this.alertsService.markNotificationSent(alert.id, channelId);
    }

    this.logger.log(`Sent notifications to ${successfulChannels.length}/${channelIds.length} channels for alert ${alert.id}`);
  }

  private async checkAndResolveAlert(rule: AlertRuleDocument, clusterId: string): Promise<void> {
    // Find active alerts for this rule and cluster
    const alerts = await this.alertsService.findAlertsByOrg(rule.orgId.toString(), {
      status: 'firing',
      clusterId,
    });

    const relevantAlerts = alerts.filter(
      a => a.alertRuleId?.toString() === rule._id.toString()
    );

    for (const alert of relevantAlerts) {
      await this.alertsService.resolveAlert(alert.id);
    }
  }
}





