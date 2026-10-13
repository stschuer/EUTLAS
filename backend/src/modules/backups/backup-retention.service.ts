import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Backup, BackupDocument } from './schemas/backup.schema';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { idVariants } from '../../common/id-variants';

// Failed backups may leave a partial staged archive; give retries a day first.
const FAILED_BACKUP_GRACE_MS = 24 * 60 * 60 * 1000;
// Well past the backup Job's 1h deadline. A backend restart abandons the backup
// it was waiting on, and a record left pending/in_progress blocks every later
// backup of that cluster.
const STALE_BACKUP_MS = 2 * 60 * 60 * 1000;
const MAX_BACKUPS_PER_RUN = 500;

/**
 * Removes the archives of expired, deleted and long-failed backups — staged
 * local copy and off-site object — and only then marks the record as purged.
 * The newest completed backup of a cluster is always kept, even when expired,
 * so a cluster whose scheduled backups stopped is never left with none.
 */
@Injectable()
export class BackupRetentionService implements OnModuleInit {
  private readonly logger = new Logger(BackupRetentionService.name);
  private isRunning = false;

  constructor(
    @InjectModel(Backup.name) private readonly backupModel: Model<BackupDocument>,
    private readonly configService: ConfigService,
    private readonly kubernetesService: KubernetesService,
  ) {}

  /** Drop the legacy TTL index that deleted records while orphaning their archives. */
  async onModuleInit(): Promise<void> {
    try {
      await this.backupModel.collection.dropIndex('expiresAt_1');
      this.logger.log('Dropped legacy TTL index expiresAt_1 on backups');
    } catch (error: any) {
      if (error?.codeName !== 'IndexNotFound' && error?.code !== 27 && error?.codeName !== 'NamespaceNotFound') {
        this.logger.warn(`Could not drop legacy backups TTL index: ${error.message}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async purgeDueBackups(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'test' || this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const now = new Date();
      await this.failStaleBackups(now);
      await this.runPurge(now);
    } catch (error: any) {
      this.logger.error(`Backup retention run failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  async failStaleBackups(now: Date): Promise<number> {
    const result = await this.backupModel
      .updateMany(
        {
          status: { $in: ['pending', 'in_progress'] },
          updatedAt: { $lte: new Date(now.getTime() - STALE_BACKUP_MS) },
        },
        {
          $set: {
            status: 'failed',
            completedAt: now,
            errorMessage: 'Backup abandoned: no progress for 2h (e.g. interrupted by a backend restart)',
          },
        },
      )
      .exec();
    if (result.modifiedCount > 0) {
      this.logger.warn(`Marked ${result.modifiedCount} abandoned backup(s) as failed`);
    }
    return result.modifiedCount;
  }

  async runPurge(now: Date): Promise<number> {
    const due = await this.backupModel
      .find({
        purgedAt: { $exists: false },
        $or: [
          { status: 'completed', expiresAt: { $lte: now } },
          { status: 'deleted' },
          { status: 'failed', createdAt: { $lte: new Date(now.getTime() - FAILED_BACKUP_GRACE_MS) } },
        ],
      })
      .select({ _id: 1, clusterId: 1, projectId: 1, status: 1 })
      .limit(MAX_BACKUPS_PER_RUN)
      .lean()
      .exec();

    const byCluster = new Map<string, { projectId: string; ids: Types.ObjectId[] }>();
    for (const backup of due) {
      const clusterId = backup.clusterId.toString();
      const entry = byCluster.get(clusterId) ?? { projectId: backup.projectId.toString(), ids: [] };
      entry.ids.push(backup._id as Types.ObjectId);
      byCluster.set(clusterId, entry);
    }

    let purged = 0;
    for (const [clusterId, { projectId, ids }] of byCluster) {
      // Raw query: clusterId is stored as a string, which the model would cast away.
      const newest = await this.backupModel.collection.findOne(
        { clusterId: { $in: idVariants(clusterId) }, status: 'completed' },
        { sort: { completedAt: -1 }, projection: { _id: 1 } },
      );
      const keepId = newest?._id?.toString();
      const purgeIds = ids.filter((id) => id.toString() !== keepId);
      if (purgeIds.length === 0) continue;

      try {
        await this.kubernetesService.purgeBackupArchives({
          clusterId,
          projectId,
          backupIds: purgeIds.map((id) => id.toString()),
        });
      } catch (error: any) {
        this.logger.error(`Purging ${purgeIds.length} backup(s) of cluster ${clusterId} failed: ${error.message}`);
        continue;
      }

      await this.backupModel
        .updateMany({ _id: { $in: purgeIds } }, { $set: { status: 'deleted', purgedAt: now } })
        .exec();
      purged += purgeIds.length;
      this.logger.log(`Purged ${purgeIds.length} backup(s) of cluster ${clusterId}`);
    }
    return purged;
  }
}
