import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { Event, EventDocument, EventType, EventSeverity } from './schemas/event.schema';
import { EventsGateway } from './events.gateway';
import { EventFilterDto, PaginatedEventsResponse } from './dto/events.dto';

interface CreateEventData {
  orgId: string;
  projectId?: string;
  clusterId?: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  userName?: string;
  resourceName?: string;
}

@Injectable()
export class EventsEnhancedService {
  private readonly logger = new Logger(EventsEnhancedService.name);

  constructor(
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    private eventsGateway: EventsGateway,
  ) {}

  async createEvent(data: CreateEventData): Promise<Event> {
    const event = new this.eventModel(data);
    const savedEvent = await event.save();
    
    // Broadcast to connected clients
    this.eventsGateway.broadcastEvent({
      ...(savedEvent.toJSON() as any),
      orgId: data.orgId,
      projectId: data.projectId,
      clusterId: data.clusterId,
    });

    this.logger.log(`Event created: ${data.type} - ${data.message}`);
    return savedEvent;
  }

  async findWithFilters(
    orgId: string,
    filters: EventFilterDto,
  ): Promise<PaginatedEventsResponse> {
    const query: FilterQuery<EventDocument> = { orgId };

    // Apply type filter
    if (filters.types && filters.types.length > 0) {
      query.type = { $in: filters.types };
    }

    // Apply severity filter
    if (filters.severities && filters.severities.length > 0) {
      query.severity = { $in: filters.severities };
    }

    // Apply search filter
    if (filters.search) {
      query.message = { $regex: filters.search, $options: 'i' };
    }

    // Apply date range filter
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    // Apply cluster filter
    if (filters.clusterId) {
      query.clusterId = filters.clusterId;
    }

    // Apply project filter
    if (filters.projectId) {
      query.projectId = filters.projectId;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.eventModel
        .find(query)
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.eventModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async exportEvents(
    orgId: string,
    filters: EventFilterDto,
    format: 'json' | 'csv',
  ): Promise<string> {
    // Get all events matching filters (no pagination for export)
    const query: FilterQuery<EventDocument> = { orgId };

    if (filters.types && filters.types.length > 0) {
      query.type = { $in: filters.types };
    }
    if (filters.severities && filters.severities.length > 0) {
      query.severity = { $in: filters.severities };
    }
    if (filters.search) {
      query.message = { $regex: filters.search, $options: 'i' };
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }
    if (filters.clusterId) {
      query.clusterId = filters.clusterId;
    }
    if (filters.projectId) {
      query.projectId = filters.projectId;
    }

    const events = await this.eventModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(10000) // Safety limit
      .exec();

    if (format === 'json') {
      return JSON.stringify(events.map(e => e.toJSON()), null, 2);
    }

    // CSV format
    const headers = [
      'id',
      'type',
      'severity',
      'message',
      'clusterId',
      'projectId',
      'orgId',
      'createdAt',
      'metadata',
    ];

    const rows = events.map(event => {
      const json = event.toJSON() as any;
      return headers.map(header => {
        const value = json[header];
        if (value === null || value === undefined) return '';
        if (header === 'metadata') return JSON.stringify(value).replace(/"/g, '""');
        if (header === 'createdAt') return new Date(value).toISOString();
        return String(value).replace(/"/g, '""');
      }).map(v => `"${v}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  async getEventStats(orgId: string, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [byType, bySeverity, timeline] = await Promise.all([
      // Events by type
      this.eventModel.aggregate([
        { $match: { orgId, createdAt: { $gte: startDate } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Events by severity
      this.eventModel.aggregate([
        { $match: { orgId, createdAt: { $gte: startDate } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),

      // Events timeline (daily)
      this.eventModel.aggregate([
        { $match: { orgId, createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
      timeline: timeline.map(item => ({
        date: item._id,
        count: item.count,
      })),
      totalEvents: timeline.reduce((sum, item) => sum + item.count, 0),
    };
  }

  async findByCluster(clusterId: string, limit = 50): Promise<Event[]> {
    return this.eventModel
      .find({ clusterId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findByProject(projectId: string, limit = 50): Promise<Event[]> {
    return this.eventModel
      .find({ projectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findByOrg(orgId: string, limit = 100): Promise<Event[]> {
    return this.eventModel
      .find({ orgId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findById(eventId: string): Promise<EventDocument | null> {
    return this.eventModel.findById(eventId).exec();
  }
}





