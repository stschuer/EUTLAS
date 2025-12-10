import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ClusterSettings, ClusterSettingsDocument } from './schemas/cluster-settings.schema';
import { UpdateClusterSettingsDto, AddScheduledScalingDto } from './dto/cluster-settings.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ClusterSettingsService {
  private readonly logger = new Logger(ClusterSettingsService.name);

  constructor(
    @InjectModel(ClusterSettings.name) private settingsModel: Model<ClusterSettingsDocument>,
    private auditService: AuditService,
  ) {}

  async getOrCreate(clusterId: string): Promise<ClusterSettingsDocument> {
    let settings = await this.settingsModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
    });

    if (!settings) {
      settings = new this.settingsModel({
        clusterId: new Types.ObjectId(clusterId),
      });
      await settings.save();
    }

    return settings;
  }

  async get(clusterId: string): Promise<ClusterSettingsDocument | null> {
    return this.settingsModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
    }).exec();
  }

  async update(
    clusterId: string,
    dto: UpdateClusterSettingsDto,
    userId?: string,
    orgId?: string,
  ): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    const previousState = settings.toJSON();

    if (dto.tags !== undefined) settings.tags = new Map(Object.entries(dto.tags));
    if (dto.labels !== undefined) settings.labels = dto.labels;
    if (dto.connectionPool) settings.connectionPool = { ...settings.connectionPool, ...dto.connectionPool };
    if (dto.readPreference) settings.readPreference = dto.readPreference as any;
    if (dto.readConcern) settings.readConcern = dto.readConcern as any;
    if (dto.writeConcern) settings.writeConcern = dto.writeConcern;
    if (dto.profilingLevel !== undefined) settings.profilingLevel = dto.profilingLevel;
    if (dto.slowOpThresholdMs !== undefined) settings.slowOpThresholdMs = dto.slowOpThresholdMs;
    if (dto.autoPauseEnabled !== undefined) settings.autoPauseEnabled = dto.autoPauseEnabled;
    if (dto.autoPauseAfterDays !== undefined) settings.autoPauseAfterDays = dto.autoPauseAfterDays;
    if (dto.backupSettings) settings.backupSettings = { ...settings.backupSettings, ...dto.backupSettings };
    if (dto.alertThresholds) settings.alertThresholds = { ...settings.alertThresholds, ...dto.alertThresholds };
    if (dto.maintenancePreferences) settings.maintenancePreferences = { ...settings.maintenancePreferences, ...dto.maintenancePreferences };

    await settings.save();

    // Audit log
    if (userId && orgId) {
      await this.auditService.log({
        orgId,
        clusterId,
        action: 'SETTINGS_CHANGED',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        previousState,
        newState: settings.toJSON(),
        description: 'Cluster settings updated',
      });
    }

    return settings;
  }

  async updateTags(clusterId: string, tags: Record<string, string>): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    settings.tags = new Map(Object.entries(tags));
    await settings.save();
    return settings;
  }

  async addTag(clusterId: string, key: string, value: string): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    settings.tags.set(key, value);
    await settings.save();
    return settings;
  }

  async removeTag(clusterId: string, key: string): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    settings.tags.delete(key);
    await settings.save();
    return settings;
  }

  async updateLabels(clusterId: string, labels: string[]): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    settings.labels = labels;
    await settings.save();
    return settings;
  }

  async addScheduledScaling(clusterId: string, dto: AddScheduledScalingDto): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    
    settings.scheduledScaling.push({
      id: uuidv4(),
      name: dto.name,
      enabled: dto.enabled,
      cronSchedule: dto.cronSchedule,
      targetPlan: dto.targetPlan,
      timezone: dto.timezone || 'UTC',
    });

    await settings.save();
    return settings;
  }

  async updateScheduledScaling(
    clusterId: string,
    scheduleId: string,
    update: Partial<AddScheduledScalingDto>,
  ): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    
    const schedule = settings.scheduledScaling.find(s => s.id === scheduleId);
    if (!schedule) {
      throw new NotFoundException('Scheduled scaling not found');
    }

    if (update.name !== undefined) schedule.name = update.name;
    if (update.enabled !== undefined) schedule.enabled = update.enabled;
    if (update.cronSchedule !== undefined) schedule.cronSchedule = update.cronSchedule;
    if (update.targetPlan !== undefined) schedule.targetPlan = update.targetPlan;
    if (update.timezone !== undefined) schedule.timezone = update.timezone;

    await settings.save();
    return settings;
  }

  async removeScheduledScaling(clusterId: string, scheduleId: string): Promise<ClusterSettingsDocument> {
    const settings = await this.getOrCreate(clusterId);
    settings.scheduledScaling = settings.scheduledScaling.filter(s => s.id !== scheduleId);
    await settings.save();
    return settings;
  }

  async getConnectionString(clusterId: string, baseConnectionString: string): Promise<string> {
    const settings = await this.get(clusterId);
    if (!settings) return baseConnectionString;

    const params = new URLSearchParams();
    
    if (settings.connectionPool.maxPoolSize) {
      params.set('maxPoolSize', settings.connectionPool.maxPoolSize.toString());
    }
    if (settings.connectionPool.minPoolSize) {
      params.set('minPoolSize', settings.connectionPool.minPoolSize.toString());
    }
    if (settings.connectionPool.connectTimeoutMS) {
      params.set('connectTimeoutMS', settings.connectionPool.connectTimeoutMS.toString());
    }
    if (settings.readPreference && settings.readPreference !== 'primary') {
      params.set('readPreference', settings.readPreference);
    }
    if (settings.writeConcern.w) {
      params.set('w', settings.writeConcern.w.toString());
    }

    const paramString = params.toString();
    if (!paramString) return baseConnectionString;

    const separator = baseConnectionString.includes('?') ? '&' : '?';
    return `${baseConnectionString}${separator}${paramString}`;
  }
}

