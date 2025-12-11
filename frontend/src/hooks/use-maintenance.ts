'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '@/lib/api-client';

export function useMaintenanceWindows(projectId: string | undefined, clusterId: string | undefined, includeHistory = false) {
  return useQuery({
    queryKey: ['maintenance-windows', projectId, clusterId, includeHistory],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await maintenanceApi.list(projectId, clusterId, includeHistory);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    refetchInterval: 60000, // Check every minute for status changes
  });
}

export function useUpcomingMaintenance(projectId: string | undefined, clusterId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['maintenance-upcoming', projectId, clusterId, days],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await maintenanceApi.getUpcoming(projectId, clusterId, days);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useMaintenanceHistory(projectId: string | undefined, clusterId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['maintenance-history', projectId, clusterId, limit],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await maintenanceApi.getHistory(projectId, clusterId, limit);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useCreateMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, data }: { projectId: string; clusterId: string; data: any }) => {
      const response = await maintenanceApi.create(projectId, clusterId, data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to create');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-upcoming', variables.projectId, variables.clusterId] });
    },
  });
}

export function useUpdateMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, windowId, data }: { projectId: string; clusterId: string; windowId: string; data: any }) => {
      const response = await maintenanceApi.update(projectId, clusterId, windowId, data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to update');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-upcoming', variables.projectId, variables.clusterId] });
    },
  });
}

export function useCancelMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, windowId, reason }: { projectId: string; clusterId: string; windowId: string; reason?: string }) => {
      const response = await maintenanceApi.cancel(projectId, clusterId, windowId, reason);
      if (!response.success) throw new Error(response.error?.message || 'Failed to cancel');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-upcoming', variables.projectId, variables.clusterId] });
    },
  });
}

export function useDeferMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, windowId, days, reason }: { projectId: string; clusterId: string; windowId: string; days: number; reason?: string }) => {
      const response = await maintenanceApi.defer(projectId, clusterId, windowId, days, reason);
      if (!response.success) throw new Error(response.error?.message || 'Failed to defer');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-upcoming', variables.projectId, variables.clusterId] });
    },
  });
}



