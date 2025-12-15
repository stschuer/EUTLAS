import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MaintenanceWindow, MaintenanceWindowDocument, DayOfWeek } from './schemas/maintenance-window.schema';
import { CreateMaintenanceWindowDto, UpdateMaintenanceWindowDto, DeferMaintenanceDto, ScheduleEmergencyMaintenanceDto } from './dto/maintenance.dto';
import { EventsService } from '../events/events.service';

const DAY_TO_NUMBER: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectModel(MaintenanceWindow.name) private maintenanceModel: Model<MaintenanceWindowDocument>,
    private eventsService: EventsService,
  ) {}

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    dto: CreateMaintenanceWindowDto,
  ): Promise<MaintenanceWindow> {
    // Calculate next scheduled time
    const nextScheduled = this.calculateNextScheduledTime(
      dto.dayOfWeek as DayOfWeek,
      dto.startHour,
      dto.timezone || 'UTC',
    );

    const window = new this.maintenanceModel({
      clusterId: new Types.ObjectId(clusterId),
      projectId: new Types.ObjectId(projectId),
      orgId: new Types.ObjectId(orgId),
      type: 'scheduled',
      status: 'scheduled',
      title: dto.title,
      description: dto.description,
      dayOfWeek: dto.dayOfWeek,
      startHour: dto.startHour,
      durationHours: dto.durationHours,
      timezone: dto.timezone || 'UTC',
      autoDeferEnabled: dto.autoDeferEnabled ?? false,
      maxDeferDays: dto.maxDeferDays || 7,
      scheduledStartTime: nextScheduled,
      scheduledEndTime: new Date(nextScheduled.getTime() + dto.durationHours * 60 * 60 * 1000),
      createdBy: new Types.ObjectId(userId),
    });

    await window.save();

    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Maintenance window "${dto.title}" scheduled for ${dto.dayOfWeek} at ${dto.startHour}:00 ${dto.timezone || 'UTC'}`,
      metadata: { maintenanceWindowId: window.id },
    });

    this.logger.log(`Created maintenance window ${window.id} for cluster ${clusterId}`);
    return window;
  }

  private calculateNextScheduledTime(dayOfWeek: DayOfWeek, hour: number, timezone: string): Date {
    const now = new Date();
    const targetDay = DAY_TO_NUMBER[dayOfWeek];
    const currentDay = now.getUTCDay();
    
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && now.getUTCHours() >= hour)) {
      daysUntil += 7;
    }
    
    const scheduledDate = new Date(now);
    scheduledDate.setUTCDate(now.getUTCDate() + daysUntil);
    scheduledDate.setUTCHours(hour, 0, 0, 0);
    
    return scheduledDate;
  }

  async findAllByCluster(clusterId: string, includeHistory = false): Promise<MaintenanceWindow[]> {
    const query: any = { clusterId: new Types.ObjectId(clusterId) };
    
    if (!includeHistory) {
      query.status = { $in: ['scheduled', 'in_progress'] };
    }
    
    return this.maintenanceModel
      .find(query)
      .sort({ scheduledStartTime: 1 })
      .exec();
  }

  async findById(windowId: string): Promise<MaintenanceWindow | null> {
    return this.maintenanceModel.findById(windowId).exec();
  }

  async getUpcoming(clusterId: string, days = 30): Promise<MaintenanceWindow[]> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.maintenanceModel
      .find({
        clusterId: new Types.ObjectId(clusterId),
        status: 'scheduled',
        scheduledStartTime: { $lte: endDate },
      })
      .sort({ scheduledStartTime: 1 })
      .exec();
  }

  async update(windowId: string, dto: UpdateMaintenanceWindowDto): Promise<MaintenanceWindow> {
    const window = await this.maintenanceModel.findById(windowId);
    if (!window) {
      throw new NotFoundException('Maintenance window not found');
    }

    if (window.status !== 'scheduled') {
      throw new BadRequestException('Can only update scheduled maintenance windows');
    }

    if (dto.title) window.title = dto.title;
    if (dto.description !== undefined) window.description = dto.description;
    if (dto.durationHours) window.durationHours = dto.durationHours;
    if (dto.autoDeferEnabled !== undefined) window.autoDeferEnabled = dto.autoDeferEnabled;
    if (dto.maxDeferDays) window.maxDeferDays = dto.maxDeferDays;

    // Recalculate schedule if day/hour changed
    if (dto.dayOfWeek || dto.startHour !== undefined) {
      const day = (dto.dayOfWeek as DayOfWeek) || window.dayOfWeek;
      const hour = dto.startHour ?? window.startHour;
      const tz = dto.timezone || window.timezone;
      
      if (dto.dayOfWeek) window.dayOfWeek = dto.dayOfWeek as DayOfWeek;
      if (dto.startHour !== undefined) window.startHour = dto.startHour;
      if (dto.timezone) window.timezone = dto.timezone;
      
      window.scheduledStartTime = this.calculateNextScheduledTime(day, hour, tz);
      window.scheduledEndTime = new Date(
        window.scheduledStartTime.getTime() + (dto.durationHours || window.durationHours) * 60 * 60 * 1000
      );
    }

    await window.save();
    return window;
  }

  async cancel(windowId: string, userId: string, reason?: string): Promise<MaintenanceWindow> {
    const window = await this.maintenanceModel.findById(windowId);
    if (!window) {
      throw new NotFoundException('Maintenance window not found');
    }

    if (!['scheduled', 'in_progress'].includes(window.status)) {
      throw new BadRequestException('Can only cancel scheduled or in-progress maintenance');
    }

    window.status = 'cancelled';
    window.cancelledBy = new Types.ObjectId(userId);
    if (reason) window.notes = reason;
    await window.save();

    await this.eventsService.createEvent({
      orgId: window.orgId.toString(),
      projectId: window.projectId.toString(),
      clusterId: window.clusterId.toString(),
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Maintenance window "${window.title}" cancelled`,
      metadata: { maintenanceWindowId: window.id, reason },
    });

    return window;
  }

  async defer(windowId: string, dto: DeferMaintenanceDto): Promise<MaintenanceWindow> {
    const window = await this.maintenanceModel.findById(windowId);
    if (!window) {
      throw new NotFoundException('Maintenance window not found');
    }

    if (window.status !== 'scheduled') {
      throw new BadRequestException('Can only defer scheduled maintenance');
    }

    if (window.currentDeferCount >= (window.maxDeferDays / 7)) {
      throw new BadRequestException('Maximum defer limit reached');
    }

    // Add days to scheduled time
    const newStartTime = new Date(window.scheduledStartTime!);
    newStartTime.setDate(newStartTime.getDate() + dto.days);
    
    const newEndTime = new Date(newStartTime.getTime() + window.durationHours * 60 * 60 * 1000);

    window.scheduledStartTime = newStartTime;
    window.scheduledEndTime = newEndTime;
    window.currentDeferCount += 1;
    if (dto.reason) {
      window.notes = `Deferred: ${dto.reason}`;
    }

    await window.save();

    await this.eventsService.createEvent({
      orgId: window.orgId.toString(),
      projectId: window.projectId.toString(),
      clusterId: window.clusterId.toString(),
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Maintenance window "${window.title}" deferred by ${dto.days} days`,
      metadata: { maintenanceWindowId: window.id },
    });

    return window;
  }

  async scheduleEmergency(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    dto: ScheduleEmergencyMaintenanceDto,
  ): Promise<MaintenanceWindow> {
    const startTime = new Date(dto.scheduledStartTime);
    const endTime = new Date(startTime.getTime() + dto.estimatedDurationMinutes * 60 * 1000);

    const window = new this.maintenanceModel({
      clusterId: new Types.ObjectId(clusterId),
      projectId: new Types.ObjectId(projectId),
      orgId: new Types.ObjectId(orgId),
      type: 'emergency',
      status: 'scheduled',
      title: dto.title,
      description: dto.description,
      dayOfWeek: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()],
      startHour: startTime.getHours(),
      durationHours: Math.ceil(dto.estimatedDurationMinutes / 60),
      timezone: 'UTC',
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      requiresDowntime: dto.requiresDowntime ?? false,
      estimatedDowntimeMinutes: dto.requiresDowntime ? dto.estimatedDurationMinutes : 0,
      affectedComponents: dto.affectedComponents,
      createdBy: new Types.ObjectId(userId),
    });

    await window.save();

    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'warning',
      message: `Emergency maintenance "${dto.title}" scheduled`,
      metadata: { maintenanceWindowId: window.id, emergency: true },
    });

    return window;
  }

  async getHistory(clusterId: string, limit = 10): Promise<MaintenanceWindow[]> {
    return this.maintenanceModel
      .find({
        clusterId: new Types.ObjectId(clusterId),
        status: { $in: ['completed', 'cancelled', 'failed'] },
      })
      .sort({ actualEndTime: -1 })
      .limit(limit)
      .exec();
  }

  // Check for maintenance windows that need to start
  @Cron(CronExpression.EVERY_MINUTE)
  async checkMaintenanceWindows(): Promise<void> {
    const now = new Date();
    
    // Find windows that should start
    const windowsToStart = await this.maintenanceModel.find({
      status: 'scheduled',
      scheduledStartTime: { $lte: now },
    });

    for (const window of windowsToStart) {
      window.status = 'in_progress';
      window.actualStartTime = new Date();
      await window.save();

      await this.eventsService.createEvent({
        orgId: window.orgId.toString(),
        projectId: window.projectId.toString(),
        clusterId: window.clusterId.toString(),
        type: 'CLUSTER_UPDATED',
        severity: 'info',
        message: `Maintenance "${window.title}" started`,
        metadata: { maintenanceWindowId: window.id },
      });

      // Simulate maintenance completion after duration
      setTimeout(async () => {
        const w = await this.maintenanceModel.findById(window.id);
        if (w && w.status === 'in_progress') {
          w.status = 'completed';
          w.actualEndTime = new Date();
          w.operationsPerformed = ['System updates', 'Security patches', 'Performance optimizations'];
          await w.save();
        }
      }, window.durationHours * 60 * 60 * 1000);
    }
  }
}





