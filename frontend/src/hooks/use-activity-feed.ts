'use client';

import { useQuery } from '@tanstack/react-query';
import { activityApi, ActivityFilters } from '@/lib/api-client';

export function useActivityFeed(orgId: string | undefined, filters?: ActivityFilters) {
  return useQuery({
    queryKey: ['activity-feed', orgId, filters],
    queryFn: async () => {
      if (!orgId) return { data: [], page: 1, totalPages: 1, total: 0 };
      try {
        const response = await activityApi.getActivityFeed(orgId, filters);
        if (!response.success) {
          return { data: [], page: 1, totalPages: 1, total: 0 };
        }
        return response;
      } catch (error) {
        console.warn('Failed to fetch activity feed:', error);
        return { data: [], page: 1, totalPages: 1, total: 0 };
      }
    },
    enabled: !!orgId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useActivityStats(orgId: string | undefined, days?: number) {
  return useQuery({
    queryKey: ['activity-stats', orgId, days],
    queryFn: async () => {
      if (!orgId) return { totalEvents: 0, byType: {}, bySeverity: {} };
      try {
        const response = await activityApi.getStats(orgId, days);
        if (!response.success) {
          return { totalEvents: 0, byType: {}, bySeverity: {} };
        }
        return response.data || { totalEvents: 0, byType: {}, bySeverity: {} };
      } catch (error) {
        console.warn('Failed to fetch activity stats:', error);
        return { totalEvents: 0, byType: {}, bySeverity: {} };
      }
    },
    enabled: !!orgId,
  });
}

export function useEventTypes(orgId: string | undefined) {
  return useQuery({
    queryKey: ['event-types', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      try {
        const response = await activityApi.getEventTypes(orgId);
        if (!response.success) {
          return [];
        }
        return response.data || [];
      } catch (error) {
        console.warn('Failed to fetch event types:', error);
        return [];
      }
    },
    enabled: !!orgId,
    staleTime: Infinity, // Types don't change often
  });
}

export function useSeverityLevels(orgId: string | undefined) {
  return useQuery({
    queryKey: ['severity-levels', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      try {
        const response = await activityApi.getSeverities(orgId);
        if (!response.success) {
          return [];
        }
        return response.data || [];
      } catch (error) {
        console.warn('Failed to fetch severity levels:', error);
        return [];
      }
    },
    enabled: !!orgId,
    staleTime: Infinity, // Severities don't change
  });
}





