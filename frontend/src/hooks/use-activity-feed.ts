'use client';

import { useQuery } from '@tanstack/react-query';
import { activityApi, ActivityFilters } from '@/lib/api-client';

export function useActivityFeed(orgId: string | undefined, filters?: ActivityFilters) {
  return useQuery({
    queryKey: ['activity-feed', orgId, filters],
    queryFn: async () => {
      if (!orgId) throw new Error('Org ID required');
      const response = await activityApi.getActivityFeed(orgId, filters);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch activity feed');
      }
      return response;
    },
    enabled: !!orgId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useActivityStats(orgId: string | undefined, days?: number) {
  return useQuery({
    queryKey: ['activity-stats', orgId, days],
    queryFn: async () => {
      if (!orgId) throw new Error('Org ID required');
      const response = await activityApi.getStats(orgId, days);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch activity stats');
      }
      return response.data;
    },
    enabled: !!orgId,
  });
}

export function useEventTypes(orgId: string | undefined) {
  return useQuery({
    queryKey: ['event-types', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('Org ID required');
      const response = await activityApi.getEventTypes(orgId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch event types');
      }
      return response.data;
    },
    enabled: !!orgId,
    staleTime: Infinity, // Types don't change often
  });
}

export function useSeverityLevels(orgId: string | undefined) {
  return useQuery({
    queryKey: ['severity-levels', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('Org ID required');
      const response = await activityApi.getSeverities(orgId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch severity levels');
      }
      return response.data;
    },
    enabled: !!orgId,
    staleTime: Infinity, // Severities don't change
  });
}


