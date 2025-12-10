import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ArchiveRule, ArchiveRuleDocument } from './schemas/archive-rule.schema';
import { CreateArchiveRuleDto, UpdateArchiveRuleDto } from './dto/archive.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class OnlineArchiveService {
  private readonly logger = new Logger(OnlineArchiveService.name);

  constructor(
    @InjectModel(ArchiveRule.name) private archiveRuleModel: Model<ArchiveRuleDocument>,
    private eventsService: EventsService,
  ) {}

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    dto: CreateArchiveRuleDto,
  ): Promise<ArchiveRule> {
    // Check for existing rule on same collection
    const existing = await this.archiveRuleModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      database: dto.database,
      collection: dto.collection,
      status: { $ne: 'deleting' },
    });

    if (existing) {
      throw new BadRequestException(`Archive rule already exists for ${dto.database}.${dto.collection}`);
    }

    const nextRun = this.calculateNextRun(dto.schedule || '0 2 * * *');

    const rule = new this.archiveRuleModel({
      clusterId: new Types.ObjectId(clusterId),
      projectId: new Types.ObjectId(projectId),
      orgId: new Types.ObjectId(orgId),
      name: dto.name,
      database: dto.database,
      collection: dto.collection,
      status: 'active',
      dateField: dto.dateField,
      archiveAfterDays: dto.archiveAfterDays,
      criteria: dto.criteria,
      partitionFields: dto.partitionFields,
      storageClass: dto.storageClass || 'standard',
      compressionType: dto.compressionType || 'gzip',
      schedule: dto.schedule || '0 2 * * *',
      nextRunAt: nextRun,
      createdBy: new Types.ObjectId(userId),
    });

    await rule.save();

    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Online archive rule "${dto.name}" created for ${dto.database}.${dto.collection}`,
      metadata: { archiveRuleId: rule.id },
    });

    this.logger.log(`Created archive rule ${rule.id} for ${dto.database}.${dto.collection}`);
    return rule;
  }

  private calculateNextRun(schedule: string): Date {
    // Simple next run calculation (in production, use a proper cron parser)
    const now = new Date();
    const parts = schedule.split(' ');
    const hour = parseInt(parts[1]) || 2;
    
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }

  async findAllByCluster(clusterId: string): Promise<ArchiveRule[]> {
    return this.archiveRuleModel
      .find({
        clusterId: new Types.ObjectId(clusterId),
        status: { $ne: 'deleting' },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(ruleId: string): Promise<ArchiveRule | null> {
    return this.archiveRuleModel.findById(ruleId).exec();
  }

  async update(ruleId: string, dto: UpdateArchiveRuleDto): Promise<ArchiveRule> {
    const rule = await this.archiveRuleModel.findById(ruleId);
    if (!rule) {
      throw new NotFoundException('Archive rule not found');
    }

    if (dto.name) rule.name = dto.name;
    if (dto.archiveAfterDays) rule.archiveAfterDays = dto.archiveAfterDays;
    if (dto.criteria) rule.criteria = dto.criteria;
    if (dto.storageClass) rule.storageClass = dto.storageClass;
    if (dto.schedule) {
      rule.schedule = dto.schedule;
      rule.nextRunAt = this.calculateNextRun(dto.schedule);
    }

    await rule.save();
    return rule;
  }

  async delete(ruleId: string): Promise<void> {
    const rule = await this.archiveRuleModel.findById(ruleId);
    if (!rule) {
      throw new NotFoundException('Archive rule not found');
    }

    rule.status = 'deleting';
    await rule.save();

    // Actually delete after cleanup
    setTimeout(async () => {
      await this.archiveRuleModel.findByIdAndDelete(ruleId);
    }, 5000);
  }

  async pause(ruleId: string): Promise<ArchiveRule> {
    const rule = await this.archiveRuleModel.findById(ruleId);
    if (!rule) {
      throw new NotFoundException('Archive rule not found');
    }

    rule.status = 'paused';
    await rule.save();
    return rule;
  }

  async resume(ruleId: string): Promise<ArchiveRule> {
    const rule = await this.archiveRuleModel.findById(ruleId);
    if (!rule) {
      throw new NotFoundException('Archive rule not found');
    }

    rule.status = 'active';
    rule.nextRunAt = this.calculateNextRun(rule.schedule);
    await rule.save();
    return rule;
  }

  async runNow(ruleId: string): Promise<{ documentsArchived: number; bytesArchived: number }> {
    const rule = await this.archiveRuleModel.findById(ruleId);
    if (!rule) {
      throw new NotFoundException('Archive rule not found');
    }

    // Simulate archiving
    const documentsArchived = Math.floor(Math.random() * 1000) + 100;
    const bytesArchived = documentsArchived * (Math.floor(Math.random() * 500) + 200);

    rule.lastRunAt = new Date();
    rule.nextRunAt = this.calculateNextRun(rule.schedule);
    rule.documentsArchived += documentsArchived;
    rule.bytesArchived += bytesArchived;
    rule.totalRuns += 1;
    await rule.save();

    await this.eventsService.createEvent({
      orgId: rule.orgId.toString(),
      projectId: rule.projectId.toString(),
      clusterId: rule.clusterId.toString(),
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Archived ${documentsArchived} documents from ${rule.database}.${rule.collection}`,
      metadata: { archiveRuleId: rule.id, documentsArchived, bytesArchived },
    });

    return { documentsArchived, bytesArchived };
  }

  async getStats(clusterId: string): Promise<{
    totalRules: number;
    activeRules: number;
    totalDocumentsArchived: number;
    totalBytesArchived: number;
    storageByClass: Record<string, number>;
  }> {
    const rules = await this.archiveRuleModel.find({
      clusterId: new Types.ObjectId(clusterId),
      status: { $ne: 'deleting' },
    }).exec();

    const storageByClass: Record<string, number> = {};
    let totalDocs = 0;
    let totalBytes = 0;
    let active = 0;

    for (const rule of rules) {
      totalDocs += rule.documentsArchived || 0;
      totalBytes += rule.bytesArchived || 0;
      storageByClass[rule.storageClass] = (storageByClass[rule.storageClass] || 0) + (rule.bytesArchived || 0);
      if (rule.status === 'active') active++;
    }

    return {
      totalRules: rules.length,
      activeRules: active,
      totalDocumentsArchived: totalDocs,
      totalBytesArchived: totalBytes,
      storageByClass,
    };
  }

  // Process archive rules on schedule
  @Cron(CronExpression.EVERY_HOUR)
  async processArchiveRules(): Promise<void> {
    const now = new Date();
    const rulesToRun = await this.archiveRuleModel.find({
      status: 'active',
      nextRunAt: { $lte: now },
    });

    for (const rule of rulesToRun) {
      try {
        await this.runNow(rule.id);
        this.logger.log(`Processed archive rule ${rule.id}`);
      } catch (error) {
        rule.lastError = error.message;
        await rule.save();
        this.logger.error(`Failed to process archive rule ${rule.id}: ${error.message}`);
      }
    }
  }
}


