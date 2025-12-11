'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scalingApi } from '@/lib/api-client';

export function useScalingRecommendations(projectId: string | undefined, clusterId: string | undefined) {
  return useQuery({
    queryKey: ['scaling-recommendations', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await scalingApi.getRecommendations(projectId, clusterId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch recommendations');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useScalingHistory(projectId: string | undefined, clusterId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['scaling-history', projectId, clusterId, limit],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('IDs required');
      const response = await scalingApi.getHistory(projectId, clusterId, limit);
      if (!response.success) throw new Error(response.error?.message || 'Failed to fetch history');
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useAnalyzeCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId }: { projectId: string; clusterId: string }) => {
      const response = await scalingApi.analyze(projectId, clusterId);
      if (!response.success) throw new Error(response.error?.message || 'Analysis failed');
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scaling-recommendations', variables.projectId, variables.clusterId] });
    },
  });
}

export function useApplyRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, recommendationId }: { projectId: string; clusterId: string; recommendationId: string }) => {
      const response = await scalingApi.applyRecommendation(projectId, clusterId, recommendationId);
      if (!response.success) throw new Error(response.error?.message || 'Failed to apply');
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scaling-recommendations', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['cluster', variables.projectId, variables.clusterId] });
    },
  });
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, clusterId, recommendationId, reason }: { projectId: string; clusterId: string; recommendationId: string; reason?: string }) => {
      const response = await scalingApi.dismissRecommendation(projectId, clusterId, recommendationId, reason);
      if (!response.success) throw new Error(response.error?.message || 'Failed to dismiss');
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scaling-recommendations', variables.projectId, variables.clusterId] });
    },
  });
}



