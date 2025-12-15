import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument, AuditAction, AuditResourceType } from './schemas/audit-log.schema';

export interface AuditLogEntry {
  orgId?: string;
  projectId?: string;
  clusterId?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  resourceName?: string;
  actorId?: string;
  actorEmail?: string;
  actorType?: 'user' | 'api_key' | 'system';
  ipAddress?: string;
  userAgent?: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  description?: string;
  status?: 'success' | 'failure';
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface AuditQueryOptions {
  orgId?: string;
  projectId?: string;
  clusterId?: string;
  actorId?: string;
  actions?: AuditAction[];
  resourceTypes?: AuditResourceType[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async log(entry: AuditLogEntry): Promise<AuditLog> {
    // Calculate changes if both states provided
    let changes: Record<string, { from: any; to: any }> | undefined;
    if (entry.previousState && entry.newState) {
      changes = {};
      const allKeys = new Set([
        ...Object.keys(entry.previousState),
        ...Object.keys(entry.newState),
      ]);
      
      for (const key of allKeys) {
        const from = entry.previousState[key];
        const to = entry.newState[key];
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes[key] = { from, to };
        }
      }
    }

    const auditLog = new this.auditLogModel({
      orgId: entry.orgId ? new Types.ObjectId(entry.orgId) : undefined,
      projectId: entry.projectId ? new Types.ObjectId(entry.projectId) : undefined,
      clusterId: entry.clusterId ? new Types.ObjectId(entry.clusterId) : undefined,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      resourceName: entry.resourceName,
      actorId: entry.actorId ? new Types.ObjectId(entry.actorId) : undefined,
      actorEmail: entry.actorEmail,
      actorType: entry.actorType || 'user',
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      previousState: entry.previousState,
      newState: entry.newState,
      changes,
      description: entry.description,
      status: entry.status || 'success',
      errorMessage: entry.errorMessage,
      metadata: entry.metadata,
      timestamp: new Date(),
    });

    await auditLog.save();
    this.logger.debug(`Audit log: ${entry.action} on ${entry.resourceType}${entry.resourceId ? ` (${entry.resourceId})` : ''}`);
    return auditLog;
  }

  async query(options: AuditQueryOptions): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query: any = {};

    if (options.orgId) query.orgId = new Types.ObjectId(options.orgId);
    if (options.projectId) query.projectId = new Types.ObjectId(options.projectId);
    if (options.clusterId) query.clusterId = new Types.ObjectId(options.clusterId);
    if (options.actorId) query.actorId = new Types.ObjectId(options.actorId);
    if (options.actions?.length) query.action = { $in: options.actions };
    if (options.resourceTypes?.length) query.resourceType = { $in: options.resourceTypes };
    
    if (options.startDate || options.endDate) {
      query.timestamp = {};
      if (options.startDate) query.timestamp.$gte = options.startDate;
      if (options.endDate) query.timestamp.$lte = options.endDate;
    }

    if (options.search) {
      query.$or = [
        { description: { $regex: options.search, $options: 'i' } },
        { actorEmail: { $regex: options.search, $options: 'i' } },
        { resourceName: { $regex: options.search, $options: 'i' } },
      ];
    }

    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string): Promise<AuditLog | null> {
    return this.auditLogModel.findById(id).exec();
  }

  async getActions(): Promise<AuditAction[]> {
    return [
      'CREATE', 'UPDATE', 'DELETE', 'READ',
      'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
      'INVITE_SENT', 'INVITE_ACCEPTED', 'MEMBER_REMOVED',
      'ROLE_CHANGED', 'API_KEY_CREATED', 'API_KEY_DELETED',
      'CLUSTER_CREATED', 'CLUSTER_DELETED', 'CLUSTER_RESIZED',
      'CLUSTER_PAUSED', 'CLUSTER_RESUMED',
      'BACKUP_CREATED', 'BACKUP_RESTORED', 'BACKUP_DELETED',
      'ALERT_TRIGGERED', 'ALERT_RESOLVED',
      'SETTINGS_CHANGED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED',
    ];
  }

  async getResourceTypes(): Promise<AuditResourceType[]> {
    return [
      'organization', 'project', 'cluster', 'user',
      'database_user', 'ip_whitelist', 'backup', 'api_key',
      'alert_rule', 'notification_channel', 'invitation',
      'archive_rule', 'maintenance_window', 'log_forwarding',
    ];
  }

  async getStats(orgId: string, days = 30): Promise<{
    totalEvents: number;
    byAction: Record<string, number>;
    byResourceType: Record<string, number>;
    byActor: Array<{ email: string; count: number }>;
    timeline: Array<{ date: string; count: number }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.auditLogModel.find({
      orgId: new Types.ObjectId(orgId),
      timestamp: { $gte: startDate },
    }).exec();

    const byAction: Record<string, number> = {};
    const byResourceType: Record<string, number> = {};
    const byActorMap: Record<string, number> = {};
    const timelineMap: Record<string, number> = {};

    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      byResourceType[log.resourceType] = (byResourceType[log.resourceType] || 0) + 1;
      
      if (log.actorEmail) {
        byActorMap[log.actorEmail] = (byActorMap[log.actorEmail] || 0) + 1;
      }
      
      const dateKey = log.timestamp.toISOString().split('T')[0];
      timelineMap[dateKey] = (timelineMap[dateKey] || 0) + 1;
    }

    const byActor = Object.entries(byActorMap)
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const timeline = Object.entries(timelineMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalEvents: logs.length,
      byAction,
      byResourceType,
      byActor,
      timeline,
    };
  }

  async exportLogs(orgId: string, startDate: Date, endDate: Date, format: 'json' | 'csv'): Promise<string> {
    const logs = await this.auditLogModel.find({
      orgId: new Types.ObjectId(orgId),
      timestamp: { $gte: startDate, $lte: endDate },
    }).sort({ timestamp: -1 }).exec();

    if (format === 'csv') {
      const headers = ['Timestamp', 'Action', 'Resource Type', 'Resource', 'Actor', 'Status', 'Description'];
      const rows = logs.map(log => [
        log.timestamp.toISOString(),
        log.action,
        log.resourceType,
        log.resourceName || log.resourceId || '',
        log.actorEmail || '',
        log.status,
        log.description || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      
      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(logs.map(l => l.toJSON()), null, 2);
  }
}





