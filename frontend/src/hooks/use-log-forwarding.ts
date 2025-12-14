'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logForwardingApi } from '@/lib/api-client';

export function useLogForwardingConfigs(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['log-forwarding', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await logForwardingApi.list(projectId, clusterId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch configs');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useLogForwardingDestinations(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['log-forwarding-destinations', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await logForwardingApi.getDestinations(projectId, clusterId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch destinations');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    staleTime: Infinity,
  });
}

export function useCreateLogForwarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, data }: { projectId: string; clusterId: string; data: any }) => {
      const response = await logForwardingApi.create(projectId, clusterId, data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to create');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['log-forwarding', variables.projectId, variables.clusterId] });
    },
  });
}

export function useDeleteLogForwarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, configId }: { projectId: string; clusterId: string; configId: string }) => {
      const response = await logForwardingApi.delete(projectId, clusterId, configId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete');
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['log-forwarding', variables.projectId, variables.clusterId] });
    },
  });
}

export function useToggleLogForwarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, configId, enabled }: { projectId: string; clusterId: string; configId: string; enabled: boolean }) => {
      const response = await logForwardingApi.toggle(projectId, clusterId, configId, enabled);
      if (!response.success) throw new Error(response.error?.message || 'Failed to toggle');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['log-forwarding', variables.projectId, variables.clusterId] });
    },
  });
}

export function useTestLogForwarding() {
  return useMutation({
    mutationFn: async ({ projectId, clusterId, configId }: { projectId: string; clusterId: string; configId: string }) => {
      const response = await logForwardingApi.test(projectId, clusterId, configId);
      if (!response.success) throw new Error(response.error?.message || 'Test failed');
      return response.data;
    },
  });
}




