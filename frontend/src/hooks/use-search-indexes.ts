'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchIndexesApi } from '@/lib/api-client';

export function useSearchIndexes(
  projectId: string | undefined,
  clusterId: string | undefined,
  database?: string,
  collection?: string
) {
  return useQuery({
    queryKey: ['search-indexes', projectId, clusterId, database, collection],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await searchIndexesApi.list(projectId, clusterId, database, collection);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch search indexes');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    refetchInterval: 10000, // Refresh every 10 seconds to check build status
  });
}

export function useSearchIndex(
  projectId: string | undefined,
  clusterId: string | undefined,
  indexId: string | undefined
) {
  return useQuery({
    queryKey: ['search-index', projectId, clusterId, indexId],
    queryFn: async () => {
      if (!projectId || !clusterId || !indexId) throw new Error('All IDs required');
      const response = await searchIndexesApi.get(projectId, clusterId, indexId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch search index');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId && !!indexId,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data && ['pending', 'building'].includes(data.status)) {
        return 2000;
      }
      return false;
    },
  });
}

export function useSearchIndexStats(
  projectId: string | undefined,
  clusterId: string | undefined
) {
  return useQuery({
    queryKey: ['search-index-stats', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await searchIndexesApi.getStats(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch stats');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useSearchIndexAnalyzers(
  projectId: string | undefined,
  clusterId: string | undefined
) {
  return useQuery({
    queryKey: ['search-index-analyzers', projectId, clusterId],
    queryFn: async () => {
      if (!projectId || !clusterId) throw new Error('Project and Cluster ID required');
      const response = await searchIndexesApi.getAnalyzers(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch analyzers');
      }
      return response.data;
    },
    enabled: !!projectId && !!clusterId,
    staleTime: Infinity,
  });
}

export function useCreateSearchIndex() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      clusterId,
      data,
    }: {
      projectId: string;
      clusterId: string;
      data: {
        name: string;
        database: string;
        collection: string;
        type: 'search' | 'vectorSearch';
        definition: object;
        analyzer?: string;
      };
    }) => {
      const response = await searchIndexesApi.create(projectId, clusterId, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create search index');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['search-indexes', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['search-index-stats', variables.projectId, variables.clusterId] });
    },
  });
}

export function useUpdateSearchIndex() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      clusterId,
      indexId,
      data,
    }: {
      projectId: string;
      clusterId: string;
      indexId: string;
      data: { definition?: object; analyzer?: string };
    }) => {
      const response = await searchIndexesApi.update(projectId, clusterId, indexId, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update search index');
      }
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['search-indexes', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['search-index', variables.projectId, variables.clusterId, variables.indexId] });
    },
  });
}

export function useDeleteSearchIndex() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      clusterId,
      indexId,
    }: {
      projectId: string;
      clusterId: string;
      indexId: string;
    }) => {
      const response = await searchIndexesApi.delete(projectId, clusterId, indexId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete search index');
      }
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['search-indexes', variables.projectId, variables.clusterId] });
      queryClient.invalidateQueries({ queryKey: ['search-index-stats', variables.projectId, variables.clusterId] });
    },
  });
}

export function useTestSearchIndex() {
  return useMutation({
    mutationFn: async ({
      projectId,
      clusterId,
      indexId,
      data,
    }: {
      projectId: string;
      clusterId: string;
      indexId: string;
      data: { query: string; path?: string; limit?: number };
    }) => {
      const response = await searchIndexesApi.test(projectId, clusterId, indexId, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to test search index');
      }
      return response.data;
    },
  });
}



