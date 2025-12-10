import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Backup, BackupDocument, BackupStatus, BackupType } from './schemas/backup.schema';
import { CreateBackupDto, RestoreBackupDto } from './dto/create-backup.dto';
import { JobsService } from '../jobs/jobs.service';
import { EventsService } from '../events/events.service';
import { ClustersService } from '../clusters/clusters.service';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    @InjectModel(Backup.name) private backupModel: Model<BackupDocument>,
    private readonly jobsService: JobsService,
    private readonly eventsService: EventsService,
    private readonly clustersService: ClustersService,
  ) {}

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    createDto: CreateBackupDto,
    type: BackupType = 'manual',
  ): Promise<Backup> {
    // Check cluster exists and is in valid state
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (!['ready', 'degraded'].includes(cluster.status)) {
      throw new BadRequestException({
        code: 'CLUSTER_NOT_READY',
        message: `Cannot backup cluster in ${cluster.status} state`,
      });
    }

    // Check for running backup
    const runningBackup = await this.backupModel.findOne({
      clusterId,
      status: { $in: ['pending', 'in_progress'] },
    }).exec();

    if (runningBackup) {
      throw new ConflictException({
        code: 'BACKUP_IN_PROGRESS',
        message: 'A backup is already in progress for this cluster',
      });
    }

    // Calculate expiration date
    const retentionDays = createDto.retentionDays || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // Create backup record
    const backup = new this.backupModel({
      clusterId,
      projectId,
      orgId,
      name: createDto.name,
      description: createDto.description,
      type,
      status: 'pending' as BackupStatus,
      retentionDays,
      expiresAt,
      mongoVersion: cluster.mongoVersion,
      createdBy: userId,
    });

    await backup.save();

    // Create backup job
    await this.jobsService.createJob({
      type: 'BACKUP_CLUSTER',
      targetClusterId: clusterId,
      targetProjectId: projectId,
      targetOrgId: orgId,
      payload: {
        backupId: backup.id,
        backupName: backup.name,
      },
    });

    // Log event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'BACKUP_STARTED',
      severity: 'info',
      message: `Backup "${createDto.name}" initiated`,
      metadata: { backupId: backup.id, type },
    });

    this.logger.log(`Created backup ${backup.id} for cluster ${clusterId}`);
    return backup;
  }

  async findAllByCluster(
    clusterId: string,
    options?: { limit?: number; status?: BackupStatus },
  ): Promise<Backup[]> {
    const query: any = { clusterId };
    
    if (options?.status) {
      query.status = options.status;
    }

    return this.backupModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit || 50)
      .exec();
  }

  async findById(backupId: string): Promise<BackupDocument | null> {
    return this.backupModel.findById(backupId).exec();
  }

  async findLatestCompleted(clusterId: string): Promise<BackupDocument | null> {
    return this.backupModel
      .findOne({ clusterId, status: 'completed' })
      .sort({ completedAt: -1 })
      .exec();
  }

  // Alias for PITR service compatibility
  async getLatest(clusterId: string): Promise<BackupDocument | null> {
    return this.findLatestCompleted(clusterId);
  }

  async restore(
    backupId: string,
    projectId: string,
    orgId: string,
    userId: string,
    restoreDto: RestoreBackupDto,
  ): Promise<{ message: string; jobId?: string }> {
    const backup = await this.findById(backupId);
    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    if (backup.status !== 'completed') {
      throw new BadRequestException({
        code: 'BACKUP_NOT_COMPLETED',
        message: 'Can only restore from completed backups',
      });
    }

    // Update backup status
    backup.status = 'restoring' as BackupStatus;
    await backup.save();

    // Create restore job
    const job = await this.jobsService.createJob({
      type: 'RESTORE_CLUSTER',
      targetClusterId: backup.clusterId.toString(),
      targetProjectId: projectId,
      targetOrgId: orgId,
      payload: {
        backupId: backup.id,
        restoreToSource: restoreDto.restoreToSource || false,
        targetClusterName: restoreDto.targetClusterName,
      },
    });

    // Log event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId: backup.clusterId.toString(),
      type: 'BACKUP_RESTORE_STARTED',
      severity: 'info',
      message: `Restore from backup "${backup.name}" initiated`,
      metadata: { backupId: backup.id },
    });

    this.logger.log(`Initiated restore from backup ${backupId}`);

    return {
      message: 'Restore initiated',
      jobId: job.id,
    };
  }

  async delete(backupId: string): Promise<void> {
    const backup = await this.findById(backupId);
    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    if (['pending', 'in_progress', 'restoring'].includes(backup.status)) {
      throw new BadRequestException({
        code: 'BACKUP_ACTIVE',
        message: 'Cannot delete an active backup',
      });
    }

    // Mark as deleted (actual storage cleanup done by background job)
    backup.status = 'deleted' as BackupStatus;
    await backup.save();

    // Log event
    await this.eventsService.createEvent({
      orgId: backup.orgId.toString(),
      projectId: backup.projectId.toString(),
      clusterId: backup.clusterId.toString(),
      type: 'BACKUP_DELETED',
      severity: 'info',
      message: `Backup "${backup.name}" deleted`,
      metadata: { backupId: backup.id },
    });

    this.logger.log(`Marked backup ${backupId} as deleted`);
  }

  // Called by job processor
  async startBackup(backupId: string): Promise<BackupDocument> {
    const backup = await this.backupModel.findByIdAndUpdate(
      backupId,
      {
        $set: {
          status: 'in_progress' as BackupStatus,
          startedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    return backup;
  }

  async completeBackup(
    backupId: string,
    result: {
      sizeBytes: number;
      compressedSizeBytes?: number;
      storagePath: string;
      metadata?: {
        databases?: string[];
        collections?: number;
        documents?: number;
        indexes?: number;
      };
    },
  ): Promise<BackupDocument> {
    const backup = await this.backupModel.findByIdAndUpdate(
      backupId,
      {
        $set: {
          status: 'completed' as BackupStatus,
          completedAt: new Date(),
          sizeBytes: result.sizeBytes,
          compressedSizeBytes: result.compressedSizeBytes || result.sizeBytes,
          storagePath: result.storagePath,
          metadata: result.metadata,
        },
      },
      { new: true },
    ).exec();

    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    // Log event
    await this.eventsService.createEvent({
      orgId: backup.orgId.toString(),
      projectId: backup.projectId.toString(),
      clusterId: backup.clusterId.toString(),
      type: 'BACKUP_COMPLETED',
      severity: 'info',
      message: `Backup "${backup.name}" completed successfully`,
      metadata: {
        backupId: backup.id,
        sizeBytes: result.sizeBytes,
      },
    });

    return backup;
  }

  async failBackup(backupId: string, errorMessage: string): Promise<BackupDocument> {
    const backup = await this.backupModel.findByIdAndUpdate(
      backupId,
      {
        $set: {
          status: 'failed' as BackupStatus,
          completedAt: new Date(),
          errorMessage,
        },
      },
      { new: true },
    ).exec();

    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    // Log event
    await this.eventsService.createEvent({
      orgId: backup.orgId.toString(),
      projectId: backup.projectId.toString(),
      clusterId: backup.clusterId.toString(),
      type: 'BACKUP_FAILED',
      severity: 'error',
      message: `Backup "${backup.name}" failed: ${errorMessage}`,
      metadata: { backupId: backup.id, error: errorMessage },
    });

    return backup;
  }

  async completeRestore(backupId: string): Promise<BackupDocument> {
    const backup = await this.backupModel.findByIdAndUpdate(
      backupId,
      { $set: { status: 'completed' as BackupStatus } },
      { new: true },
    ).exec();

    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    return backup;
  }

  // Statistics
  async getBackupStats(clusterId: string): Promise<{
    totalBackups: number;
    completedBackups: number;
    failedBackups: number;
    totalSizeBytes: number;
    lastBackupAt?: Date;
  }> {
    const stats = await this.backupModel.aggregate([
      { $match: { clusterId } },
      {
        $group: {
          _id: null,
          totalBackups: { $sum: 1 },
          completedBackups: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failedBackups: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          totalSizeBytes: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$sizeBytes', 0] },
          },
          lastBackupAt: { $max: '$completedAt' },
        },
      },
    ]).exec();

    if (stats.length === 0) {
      return {
        totalBackups: 0,
        completedBackups: 0,
        failedBackups: 0,
        totalSizeBytes: 0,
      };
    }

    return {
      totalBackups: stats[0].totalBackups,
      completedBackups: stats[0].completedBackups,
      failedBackups: stats[0].failedBackups,
      totalSizeBytes: stats[0].totalSizeBytes,
      lastBackupAt: stats[0].lastBackupAt,
    };
  }
}
