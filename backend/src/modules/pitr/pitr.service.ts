import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PitrConfig, PitrConfigDocument } from './schemas/pitr-config.schema';
import { OplogEntry, OplogEntryDocument } from './schemas/oplog-entry.schema';
import { PitrRestore, PitrRestoreDocument, PitrRestoreStatus } from './schemas/pitr-restore.schema';
import { EnablePitrDto, UpdatePitrConfigDto, CreatePitrRestoreDto, OplogStatsResponse, PitrRestoreWindowResponse } from './dto/pitr.dto';
import { EventsEnhancedService } from '../events/events-enhanced.service';
import { BackupsService } from '../backups/backups.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PitrService {
  private readonly logger = new Logger(PitrService.name);

  constructor(
    @InjectModel(PitrConfig.name) private pitrConfigModel: Model<PitrConfigDocument>,
    @InjectModel(OplogEntry.name) private oplogEntryModel: Model<OplogEntryDocument>,
    @InjectModel(PitrRestore.name) private pitrRestoreModel: Model<PitrRestoreDocument>,
    private eventsService: EventsEnhancedService,
    private backupsService: BackupsService,
  ) {}

  async enablePitr(
    clusterId: string,
    orgId: string,
    projectId: string,
    dto: EnablePitrDto,
  ): Promise<PitrConfig> {
    // Check if config already exists
    let config = await this.pitrConfigModel.findOne({ clusterId });

    if (config) {
      // Update existing config
      config.enabled = true;
      config.enabledAt = new Date();
      config.retentionDays = dto.retentionDays;
      config.settings = dto.settings || {};
      config.status = 'healthy';
      await config.save();
    } else {
      // Create new config
      config = new this.pitrConfigModel({
        clusterId: new Types.ObjectId(clusterId),
        orgId: new Types.ObjectId(orgId),
        projectId: new Types.ObjectId(projectId),
        enabled: true,
        enabledAt: new Date(),
        retentionDays: dto.retentionDays,
        status: 'healthy',
        settings: dto.settings || {
          captureIntervalMs: 1000, // 1 second (simulated)
          compressionEnabled: true,
          encryptionEnabled: true,
        },
      });
      await config.save();
    }

    // Create event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'PITR_ENABLED',
      severity: 'info',
      message: `Point-in-Time Recovery enabled with ${dto.retentionDays} day retention`,
      metadata: { retentionDays: dto.retentionDays },
    });

    this.logger.log(`PITR enabled for cluster ${clusterId}`);
    return config;
  }

  async disablePitr(clusterId: string, orgId: string, projectId: string): Promise<PitrConfig> {
    const config = await this.pitrConfigModel.findOne({ clusterId });

    if (!config) {
      throw new NotFoundException('PITR configuration not found');
    }

    config.enabled = false;
    config.status = 'inactive';
    await config.save();

    // Create event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'PITR_DISABLED',
      severity: 'info',
      message: 'Point-in-Time Recovery disabled',
    });

    this.logger.log(`PITR disabled for cluster ${clusterId}`);
    return config;
  }

  async updatePitrConfig(
    clusterId: string,
    dto: UpdatePitrConfigDto,
  ): Promise<PitrConfig> {
    const config = await this.pitrConfigModel.findOne({ clusterId });

    if (!config) {
      throw new NotFoundException('PITR configuration not found');
    }

    if (dto.retentionDays !== undefined) {
      config.retentionDays = dto.retentionDays;
    }
    if (dto.settings) {
      config.settings = { ...config.settings, ...dto.settings };
    }

    await config.save();
    return config;
  }

  async getPitrConfig(clusterId: string): Promise<PitrConfig | null> {
    return this.pitrConfigModel.findOne({ clusterId }).exec();
  }

  async getRestoreWindow(clusterId: string): Promise<PitrRestoreWindowResponse> {
    const config = await this.pitrConfigModel.findOne({ clusterId }).exec();

    if (!config || !config.enabled) {
      return {
        enabled: false,
        retentionDays: 0,
        storageSizeBytes: 0,
        status: 'inactive',
      };
    }

    // Get actual oplog bounds
    const [oldestEntry, newestEntry, stats] = await Promise.all([
      this.oplogEntryModel
        .findOne({ clusterId })
        .sort({ timestamp: 1 })
        .exec(),
      this.oplogEntryModel
        .findOne({ clusterId })
        .sort({ timestamp: -1 })
        .exec(),
      this.getOplogStats(clusterId),
    ]);

    return {
      enabled: true,
      oldestRestorePoint: oldestEntry?.timestamp || config.oldestRestorePoint,
      latestRestorePoint: newestEntry?.timestamp || config.latestRestorePoint,
      retentionDays: config.retentionDays,
      storageSizeBytes: stats.storageSizeBytes,
      status: config.status,
    };
  }

  async getOplogStats(clusterId: string): Promise<OplogStatsResponse> {
    const [stats, oldest, newest, byOp] = await Promise.all([
      this.oplogEntryModel.aggregate([
        { $match: { clusterId: new Types.ObjectId(clusterId) } },
        {
          $group: {
            _id: null,
            totalEntries: { $sum: 1 },
            storageSizeBytes: { $sum: '$sizeBytes' },
          },
        },
      ]),
      this.oplogEntryModel
        .findOne({ clusterId })
        .sort({ timestamp: 1 })
        .exec(),
      this.oplogEntryModel
        .findOne({ clusterId })
        .sort({ timestamp: -1 })
        .exec(),
      this.oplogEntryModel.aggregate([
        { $match: { clusterId: new Types.ObjectId(clusterId) } },
        { $group: { _id: '$op', count: { $sum: 1 } } },
      ]),
    ]);

    const opCounts = byOp.reduce(
      (acc, item) => {
        const opMap: Record<string, string> = { i: 'inserts', u: 'updates', d: 'deletes', c: 'commands', n: 'commands' };
        const key = opMap[item._id] || 'commands';
        acc[key] = (acc[key] || 0) + item.count;
        return acc;
      },
      { inserts: 0, updates: 0, deletes: 0, commands: 0 },
    );

    return {
      totalEntries: stats[0]?.totalEntries || 0,
      storageSizeBytes: stats[0]?.storageSizeBytes || 0,
      oldestEntry: oldest?.timestamp,
      newestEntry: newest?.timestamp,
      entriesByOperation: opCounts,
    };
  }

  async createRestore(
    clusterId: string,
    orgId: string,
    projectId: string,
    userId: string,
    dto: CreatePitrRestoreDto,
  ): Promise<PitrRestore> {
    const config = await this.pitrConfigModel.findOne({ clusterId });

    if (!config || !config.enabled) {
      throw new BadRequestException('PITR is not enabled for this cluster');
    }

    const restorePoint = new Date(dto.restorePointTimestamp);
    const restoreWindow = await this.getRestoreWindow(clusterId);

    // Validate restore point is within window
    if (restoreWindow.oldestRestorePoint && restorePoint < restoreWindow.oldestRestorePoint) {
      throw new BadRequestException(
        `Restore point is before oldest available point (${restoreWindow.oldestRestorePoint.toISOString()})`,
      );
    }
    if (restoreWindow.latestRestorePoint && restorePoint > restoreWindow.latestRestorePoint) {
      throw new BadRequestException(
        `Restore point is after latest available point (${restoreWindow.latestRestorePoint.toISOString()})`,
      );
    }

    // Find the closest snapshot before the restore point
    const baseSnapshot = await this.backupsService.getLatest(clusterId);

    // Count oplog entries needed
    const oplogCount = await this.oplogEntryModel.countDocuments({
      clusterId: new Types.ObjectId(clusterId),
      timestamp: {
        $gt: baseSnapshot?.completedAt || new Date(0),
        $lte: restorePoint,
      },
    });

    const restore = new this.pitrRestoreModel({
      sourceClusterId: new Types.ObjectId(clusterId),
      targetClusterId: dto.targetClusterId ? new Types.ObjectId(dto.targetClusterId) : undefined,
      orgId: new Types.ObjectId(orgId),
      projectId: new Types.ObjectId(projectId),
      restorePointTimestamp: restorePoint,
      baseSnapshotId: baseSnapshot ? new Types.ObjectId((baseSnapshot as any).id) : undefined,
      status: 'pending',
      progress: 0,
      initiatedBy: new Types.ObjectId(userId),
      totalOplogEntries: oplogCount,
      metadata: {
        snapshotTimestamp: baseSnapshot?.completedAt,
        oplogEndTs: restorePoint.getTime(),
      },
    });

    await restore.save();

    // Create event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'PITR_RESTORE_STARTED',
      severity: 'info',
      message: `Point-in-Time restore initiated to ${restorePoint.toISOString()}`,
      metadata: {
        restoreId: restore.id,
        restorePointTimestamp: restorePoint.toISOString(),
        oplogEntries: oplogCount,
      },
    });

    // Start async restore process
    this.processRestore(restore.id);

    return restore;
  }

  private async processRestore(restoreId: string): Promise<void> {
    const restore = await this.pitrRestoreModel.findById(restoreId);
    if (!restore) return;

    try {
      // Update status to preparing
      restore.status = 'preparing';
      restore.startedAt = new Date();
      restore.currentStep = 'Preparing restore environment';
      restore.progress = 5;
      await restore.save();

      // Simulate restore process with delays
      await this.simulateRestoreStep(restoreId, 'restoring_snapshot', 'Restoring base snapshot', 30);
      await this.simulateRestoreStep(restoreId, 'applying_oplog', 'Applying oplog entries', 70);
      await this.simulateRestoreStep(restoreId, 'verifying', 'Verifying data integrity', 90);

      // Complete the restore
      const finalRestore = await this.pitrRestoreModel.findById(restoreId);
      if (finalRestore) {
        finalRestore.status = 'completed';
        finalRestore.progress = 100;
        finalRestore.completedAt = new Date();
        finalRestore.currentStep = 'Restore completed';
        finalRestore.oplogEntriesApplied = finalRestore.totalOplogEntries;
        await finalRestore.save();

        // Create success event
        await this.eventsService.createEvent({
          orgId: finalRestore.orgId.toString(),
          projectId: finalRestore.projectId.toString(),
          clusterId: finalRestore.sourceClusterId.toString(),
          type: 'PITR_RESTORE_COMPLETED',
          severity: 'info',
          message: `Point-in-Time restore completed successfully`,
          metadata: {
            restoreId: finalRestore.id,
            oplogEntriesApplied: finalRestore.oplogEntriesApplied,
            duration: finalRestore.completedAt.getTime() - (finalRestore.startedAt?.getTime() || 0),
          },
        });
      }
    } catch (error) {
      const failedRestore = await this.pitrRestoreModel.findById(restoreId);
      if (failedRestore) {
        failedRestore.status = 'failed';
        failedRestore.errorMessage = error.message;
        failedRestore.completedAt = new Date();
        await failedRestore.save();

        // Create failure event
        await this.eventsService.createEvent({
          orgId: failedRestore.orgId.toString(),
          projectId: failedRestore.projectId.toString(),
          clusterId: failedRestore.sourceClusterId.toString(),
          type: 'PITR_RESTORE_FAILED',
          severity: 'error',
          message: `Point-in-Time restore failed: ${error.message}`,
          metadata: { restoreId: failedRestore.id, error: error.message },
        });
      }

      this.logger.error(`PITR restore ${restoreId} failed: ${error.message}`);
    }
  }

  private async simulateRestoreStep(
    restoreId: string,
    status: PitrRestoreStatus,
    step: string,
    progress: number,
  ): Promise<void> {
    const restore = await this.pitrRestoreModel.findById(restoreId);
    if (!restore) return;

    restore.status = status;
    restore.currentStep = step;
    restore.progress = progress;
    await restore.save();

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));
  }

  async getRestore(restoreId: string): Promise<PitrRestore | null> {
    return this.pitrRestoreModel.findById(restoreId).exec();
  }

  async getRestoreHistory(clusterId: string): Promise<PitrRestore[]> {
    return this.pitrRestoreModel
      .find({ sourceClusterId: clusterId })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async cancelRestore(restoreId: string): Promise<PitrRestore> {
    const restore = await this.pitrRestoreModel.findById(restoreId);
    if (!restore) {
      throw new NotFoundException('Restore not found');
    }

    if (['completed', 'failed', 'cancelled'].includes(restore.status)) {
      throw new BadRequestException('Cannot cancel a completed, failed, or already cancelled restore');
    }

    restore.status = 'cancelled';
    restore.completedAt = new Date();
    await restore.save();

    return restore;
  }

  // Simulated oplog capture - in production this would connect to MongoDB's oplog
  @Cron(CronExpression.EVERY_10_SECONDS)
  async captureOplog(): Promise<void> {
    const enabledConfigs = await this.pitrConfigModel.find({ enabled: true }).exec();

    for (const config of enabledConfigs) {
      try {
        await this.captureOplogForCluster(config);
      } catch (error) {
        this.logger.error(`Failed to capture oplog for cluster ${config.clusterId}: ${error.message}`);
      }
    }
  }

  private async captureOplogForCluster(config: PitrConfigDocument): Promise<void> {
    const batchId = uuidv4();
    const now = new Date();
    const operations: Array<'i' | 'u' | 'd' | 'c'> = ['i', 'u', 'd', 'c'];

    // Generate simulated oplog entries (1-5 random entries per capture)
    const entryCount = Math.floor(Math.random() * 5) + 1;
    const entries = [];

    for (let i = 0; i < entryCount; i++) {
      const op = operations[Math.floor(Math.random() * operations.length)];
      const ts = now.getTime() + i;

      entries.push({
        clusterId: config.clusterId,
        orgId: config.orgId,
        timestamp: new Date(ts),
        ts,
        h: uuidv4(),
        op,
        ns: `db_${Math.floor(Math.random() * 3)}.collection_${Math.floor(Math.random() * 10)}`,
        o: this.generateSimulatedOperation(op),
        sizeBytes: 100 + Math.floor(Math.random() * 500),
        compressed: config.settings?.compressionEnabled || false,
        batchId,
      });
    }

    await this.oplogEntryModel.insertMany(entries);

    // Update config
    config.lastOplogCaptureAt = now;
    config.latestRestorePoint = now;
    if (!config.oldestRestorePoint) {
      config.oldestRestorePoint = now;
    }

    // Update storage size
    const totalSize = await this.oplogEntryModel.aggregate([
      { $match: { clusterId: config.clusterId } },
      { $group: { _id: null, total: { $sum: '$sizeBytes' } } },
    ]);
    config.storageSizeBytes = totalSize[0]?.total || 0;

    await config.save();

    // Cleanup old entries based on retention
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

    const deleted = await this.oplogEntryModel.deleteMany({
      clusterId: config.clusterId,
      timestamp: { $lt: cutoffDate },
    });

    if (deleted.deletedCount > 0) {
      // Update oldest restore point
      const oldestEntry = await this.oplogEntryModel
        .findOne({ clusterId: config.clusterId })
        .sort({ timestamp: 1 })
        .exec();
      if (oldestEntry) {
        config.oldestRestorePoint = oldestEntry.timestamp;
        await config.save();
      }
    }
  }

  private generateSimulatedOperation(op: string): Record<string, any> {
    switch (op) {
      case 'i':
        return {
          _id: new Types.ObjectId(),
          name: `Document_${Math.floor(Math.random() * 1000)}`,
          value: Math.random() * 100,
          createdAt: new Date(),
        };
      case 'u':
        return {
          $set: {
            value: Math.random() * 100,
            updatedAt: new Date(),
          },
        };
      case 'd':
        return {
          _id: new Types.ObjectId(),
        };
      case 'c':
        return {
          create: `collection_${Math.floor(Math.random() * 10)}`,
        };
      default:
        return {};
    }
  }
}




