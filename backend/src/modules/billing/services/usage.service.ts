import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Interval } from '@nestjs/schedule';
import { UsageRecord, UsageRecordDocument, UsageType } from '../schemas/usage-record.schema';
import { Cluster, ClusterDocument } from '../../clusters/schemas/cluster.schema';
import { PricingService } from './pricing.service';

export interface UsageSummary {
  clusterId?: string;
  clusterName?: string;
  usageType: string;
  quantity: number;
  unit: string;
  totalCents: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface OrgUsageSummary {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCents: number;
  byCluster: {
    clusterId: string;
    clusterName: string;
    totalCents: number;
    byUsageType: { usageType: string; quantity: number; totalCents: number }[];
  }[];
  byUsageType: { usageType: string; quantity: number; totalCents: number }[];
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectModel(UsageRecord.name) private usageRecordModel: Model<UsageRecordDocument>,
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    private readonly pricingService: PricingService,
  ) {}

  // ==================== Record Usage ====================

  async recordUsage(data: {
    orgId: string;
    clusterId?: string;
    usageType: UsageType;
    quantity: number;
    metadata?: Record<string, any>;
  }): Promise<UsageRecord> {
    const now = new Date();
    const periodStart = this.getPeriodStart(now);
    const periodEnd = this.getPeriodEnd(now);

    const price = await this.pricingService.getPriceForUsageType(data.usageType);
    const unitPriceCents = price?.perUnitAmountCents || 0;
    const totalCents = Math.round(data.quantity * unitPriceCents);

    const record = new this.usageRecordModel({
      orgId: new Types.ObjectId(data.orgId),
      clusterId: data.clusterId ? new Types.ObjectId(data.clusterId) : undefined,
      usageType: data.usageType,
      quantity: data.quantity,
      unit: this.getUnitForUsageType(data.usageType),
      unitPriceCents,
      totalCents,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      metadata: data.metadata,
    });

    await record.save();
    return record;
  }

  async recordClusterUsage(
    clusterId: string,
    usageType: UsageType,
    quantity: number,
    metadata?: Record<string, any>,
  ): Promise<UsageRecord> {
    const cluster = await this.clusterModel.findById(clusterId).exec();
    if (!cluster) {
      throw new Error('Cluster not found');
    }

    return this.recordUsage({
      orgId: cluster.orgId.toString(),
      clusterId,
      usageType,
      quantity,
      metadata: {
        ...metadata,
        clusterName: cluster.name,
        planType: cluster.plan,
      },
    });
  }

  // ==================== Query Usage ====================

  async getUsageByOrg(
    orgId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      usageType?: UsageType;
      clusterId?: string;
    },
  ): Promise<UsageRecord[]> {
    const query: any = { orgId };

    if (options?.startDate || options?.endDate) {
      query.billingPeriodStart = {};
      if (options.startDate) {
        query.billingPeriodStart.$gte = options.startDate;
      }
      if (options.endDate) {
        query.billingPeriodEnd = { $lte: options.endDate };
      }
    }

    if (options?.usageType) {
      query.usageType = options.usageType;
    }

    if (options?.clusterId) {
      query.clusterId = options.clusterId;
    }

    return this.usageRecordModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async getUsageSummary(
    orgId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<OrgUsageSummary> {
    const records = await this.usageRecordModel.find({
      orgId,
      billingPeriodStart: { $gte: periodStart },
      billingPeriodEnd: { $lte: periodEnd },
    }).exec();

    const byClusterMap = new Map<string, {
      clusterId: string;
      clusterName: string;
      totalCents: number;
      byUsageType: Map<string, { quantity: number; totalCents: number }>;
    }>();

    const byUsageTypeMap = new Map<string, { quantity: number; totalCents: number }>();
    let totalCents = 0;

    for (const record of records) {
      totalCents += record.totalCents;

      // Aggregate by usage type
      const utKey = record.usageType;
      const utData = byUsageTypeMap.get(utKey) || { quantity: 0, totalCents: 0 };
      utData.quantity += record.quantity;
      utData.totalCents += record.totalCents;
      byUsageTypeMap.set(utKey, utData);

      // Aggregate by cluster
      if (record.clusterId) {
        const cKey = record.clusterId.toString();
        const cData = byClusterMap.get(cKey) || {
          clusterId: cKey,
          clusterName: record.metadata?.clusterName || 'Unknown',
          totalCents: 0,
          byUsageType: new Map(),
        };
        cData.totalCents += record.totalCents;

        const cUtData = cData.byUsageType.get(utKey) || { quantity: 0, totalCents: 0 };
        cUtData.quantity += record.quantity;
        cUtData.totalCents += record.totalCents;
        cData.byUsageType.set(utKey, cUtData);

        byClusterMap.set(cKey, cData);
      }
    }

    return {
      orgId,
      periodStart,
      periodEnd,
      totalCents,
      byCluster: Array.from(byClusterMap.values()).map(c => ({
        ...c,
        byUsageType: Array.from(c.byUsageType.entries()).map(([usageType, data]) => ({
          usageType,
          ...data,
        })),
      })),
      byUsageType: Array.from(byUsageTypeMap.entries()).map(([usageType, data]) => ({
        usageType,
        ...data,
      })),
    };
  }

  async getUninvoicedUsage(orgId: string, periodEnd: Date): Promise<UsageRecord[]> {
    return this.usageRecordModel.find({
      orgId,
      invoiced: false,
      billingPeriodEnd: { $lte: periodEnd },
    }).exec();
  }

  async markUsageAsInvoiced(usageIds: string[], invoiceId: string): Promise<void> {
    await this.usageRecordModel.updateMany(
      { _id: { $in: usageIds.map(id => new Types.ObjectId(id)) } },
      {
        $set: {
          invoiced: true,
          invoiceId: new Types.ObjectId(invoiceId),
        },
      },
    ).exec();
  }

  // ==================== Automatic Usage Collection ====================

  @Interval(3600000) // Every hour
  async collectClusterUsage(): Promise<void> {
    this.logger.debug('Collecting cluster usage...');

    try {
      // Get all running clusters
      const runningClusters = await this.clusterModel.find({
        status: { $in: ['ready', 'degraded'] },
      }).exec();

      for (const cluster of runningClusters) {
        // Record 1 hour of cluster usage
        await this.recordClusterUsage(
          cluster._id.toString(),
          'cluster_hours',
          1,
          { autoCollected: true },
        );

        // TODO: In production, also collect:
        // - storage_gb_hours (from metrics)
        // - data_transfer_gb (from network metrics)
        // - backup_storage_gb (from backup sizes)
      }

      this.logger.log(`Collected usage for ${runningClusters.length} clusters`);
    } catch (error: any) {
      this.logger.error(`Failed to collect cluster usage: ${error.message}`);
    }
  }

  // ==================== Helpers ====================

  private getPeriodStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  private getPeriodEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  private getUnitForUsageType(usageType: UsageType): string {
    const units: Record<UsageType, string> = {
      cluster_hours: 'hours',
      storage_gb_hours: 'gb-hours',
      data_transfer_gb: 'gb',
      backup_storage_gb: 'gb',
      iops: 'count',
      connections: 'count',
    };
    return units[usageType] || 'unit';
  }
}



