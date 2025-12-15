import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Event, EventDocument, EventType, EventSeverity } from './schemas/event.schema';

interface CreateEventData {
  orgId: string;
  projectId?: string;
  clusterId?: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
  ) {}

  async createEvent(data: CreateEventData): Promise<Event> {
    const event = new this.eventModel(data);
    return event.save();
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





