import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BackupPolicyService } from './backup-policy.service';
import { BackupsService } from './backups.service';
import { ClustersService } from '../clusters/clusters.service';
import { BackupPolicyDocument } from './schemas/backup-policy.schema';

@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly policyService: BackupPolicyService,
    private readonly backupsService: BackupsService,
    private readonly clustersService: ClustersService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledBackups(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const policies = await this.policyService.findEnabledPolicies();
      this.logger.log(`Checking ${policies.length} backup policies for scheduled snapshots`);

      for (const policy of policies) {
        await this.processPolicy(policy);
      }
    } catch (error: any) {
      this.logger.error(`Scheduled backup run failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async processPolicy(policy: BackupPolicyDocument): Promise<void> {
    const clusterId = policy.clusterId.toString();

    if (!this.policyService.isDueForSnapshot(policy)) {
      return;
    }

    if (!this.policyService.isWithinBackupWindow(policy)) {
      this.logger.debug(`Cluster ${clusterId} outside backup window, skipping`);
      return;
    }

    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster) {
      this.logger.warn(`Cluster ${clusterId} not found for scheduled backup`);
      return;
    }

    if (!['ready', 'degraded'].includes(cluster.status)) {
      this.logger.debug(`Cluster ${clusterId} in ${cluster.status} state, skipping scheduled backup`);
      return;
    }

    try {
      await this.backupsService.createScheduled(
        clusterId,
        cluster.projectId.toString(),
        cluster.orgId.toString(),
        policy.snapshotRetentionDays,
      );

      this.logger.log(`Scheduled backup queued for cluster ${clusterId}`);
    } catch (error: any) {
      const response = typeof error?.getResponse === 'function'
        ? error.getResponse()
        : error?.response;

      if (response?.code === 'BACKUP_IN_PROGRESS') {
        this.logger.debug(`Cluster ${clusterId} already has a backup in progress`);
        return;
      }

      this.logger.error(`Failed to queue scheduled backup for cluster ${clusterId}: ${error.message}`);

      if (policy.alertOnFailure) {
        this.logger.warn(
          `Backup failure alert for cluster ${clusterId} (recipients: ${policy.alertRecipients?.join(', ') || 'none configured'})`,
        );
      }
    }
  }
}
