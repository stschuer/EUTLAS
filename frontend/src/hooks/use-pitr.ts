'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pitrApi } from '@/lib/api-client';

export function usePitrConfig(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['pitr-config', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await pitrApi.getConfig(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch PITR config');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useEnablePitr() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      clusterId, 
      retentionDays,
      settings 
    }: { 
      projectId: string; 
      clusterId: string; 
      retentionDays: number;
      settings?: object;
    }) => {
      const response = await pitrApi.enable(projectId, clusterId, { retentionDays, settings });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to enable PITR');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pitr-config', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['pitr-window', variables.projectId, variables.clusterId] });
    },
  });
}

export function useDisablePitr() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ projectId, clusterId }: { projectId: string; clusterId: string }) => {
      const response = await pitrApi.disable(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to disable PITR');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pitr-config', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['pitr-window', variables.projectId, variables.clusterId] });
    },
  });
}

export function usePitrRestoreWindow(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['pitr-window', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await pitrApi.getRestoreWindow(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch restore window');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useOplogStats(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['oplog-stats', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await pitrApi.getOplogStats(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch oplog stats');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useCreatePitrRestore() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      clusterId, 
      restorePointTimestamp,
      targetClusterId 
    }: { 
      projectId: string; 
      clusterId: string; 
      restorePointTimestamp: string;
      targetClusterId?: string;
    }) => {
      const response = await pitrApi.createRestore(projectId, clusterId, { restorePointTimestamp, targetClusterId });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create PITR restore');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pitr-restore-history', variables.projectId, variables.clusterId] });
    },
  });
}

export function usePitrRestoreHistory(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['pitr-restore-history', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await pitrApi.getRestoreHistory(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch restore history');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function usePitrRestoreStatus(
  projectId: string | undefined, 
  clusterId: string | undefined, 
  restoreId: string | undefined
) {
  return useQuery({
    queryKey: ['pitr-restore-status', projectId, clusterId, restoreId],
    queryFn: async () => {
      if (!projectId || !clusterId || !restoreId) throw new Error('All IDs required');
      const response = await pitrApi.getRestore(projectId, clusterId, restoreId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch restore status');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId && !!restoreId,
    refetchInterval: (query) => {
      // Poll frequently while restore is in progress
      const data = query.state.data as any;
      if (data && ['pending', 'preparing', 'restoring_snapshot', 'applying_oplog', 'verifying'].includes(data.status)) {
        return 2000;
      }
      return false;
    },
  });
}

export function useCancelPitrRestore() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      clusterId, 
      restoreId 
    }: { 
      projectId: string; 
      clusterId: string; 
      restoreId: string;
    }) => {
      const response = await pitrApi.cancelRestore(projectId, clusterId, restoreId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to cancel restore');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pitr-restore-status', variables.projectId, variables.clusterId, variables.restoreId] });
      queryClient.invalidateQueries({ queryKey: ['pitr-restore-history', variables.projectId, variables.clusterId] });
    },
  });
}




