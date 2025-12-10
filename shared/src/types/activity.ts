import { EventType, EventSeverity } from './event';

export interface ActivityEvent {
  id: string;
  orgId: string;
  projectId?: string;
  clusterId?: string;
  type: EventType;
  severity: EventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface EventFilter {
  types?: string[];
  severities?: string[];
  search?: string;
  startDate?: string;
  endDate?: string;
  clusterId?: string;
  projectId?: string;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedEvents {
  data: ActivityEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface EventStats {
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  timeline: Array<{ date: string; count: number }>;
  totalEvents: number;
}

export interface EventTypeInfo {
  value: string;
  label: string;
  category: string;
}

export interface SeverityInfo {
  value: string;
  label: string;
  color: string;
}


