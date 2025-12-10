"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clustersApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";

/**
 * Clusters hooks
 */

export function useClusters(projectId: string) {
  return useQuery({
    queryKey: ["clusters", projectId],
    queryFn: async () => {
      const response = await clustersApi.list(projectId);
      if (response.success && response.data) {
        return response.data as any[];
      }
      throw new Error(response.error?.message || "Failed to load clusters");
    },
    enabled: !!projectId,
    refetchInterval: 10000, // Refetch every 10 seconds to get status updates
  });
}

export function useCluster(projectId: string, clusterId: string) {
  return useQuery({
    queryKey: ["clusters", projectId, clusterId],
    queryFn: async () => {
      const response = await clustersApi.get(projectId, clusterId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to load cluster");
    },
    enabled: !!projectId && !!clusterId,
    refetchInterval: 5000, // Refetch more frequently for single cluster
  });
}

export function useClusterCredentials(projectId: string, clusterId: string) {
  return useQuery({
    queryKey: ["clusterCredentials", projectId, clusterId],
    queryFn: async () => {
      const response = await clustersApi.getCredentials(projectId, clusterId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to load credentials");
    },
    enabled: !!projectId && !!clusterId,
  });
}

export function useCreateCluster(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; plan: string; mongoVersion?: string }) => {
      const response = await clustersApi.create(projectId, data);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to create cluster");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters", projectId] });
      toast({
        title: "Cluster creation started!",
        description: "Your cluster is being provisioned. This may take a few minutes.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });
}

export function useResizeCluster(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ clusterId, plan }: { clusterId: string; plan: string }) => {
      const response = await clustersApi.resize(projectId, clusterId, { plan });
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to resize cluster");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters", projectId] });
      toast({
        title: "Resize initiated",
        description: "Your cluster is being resized.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });
}

export function useDeleteCluster(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await clustersApi.delete(projectId, clusterId);
      if (!response.success) {
        throw new Error(response.error?.message || "Failed to delete cluster");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters", projectId] });
      toast({
        title: "Cluster deletion started",
        description: "Your cluster is being deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });
}

/**
 * Get all clusters across all projects
 */
export function useAllClusters() {
  return useQuery({
    queryKey: ["allClusters"],
    queryFn: async () => {
      // First get all orgs
      const orgsResponse = await import("@/lib/api-client").then(m => m.orgsApi.list());
      if (!orgsResponse.success || !orgsResponse.data) {
        return [];
      }

      const orgs = orgsResponse.data as any[];
      const allClusters: any[] = [];

      // Get projects for each org, then clusters for each project
      for (const org of orgs) {
        const projResponse = await import("@/lib/api-client").then(m => m.projectsApi.list(org.id));
        if (projResponse.success && projResponse.data) {
          const projects = projResponse.data as any[];
          
          for (const project of projects) {
            const clustersResponse = await clustersApi.list(project.id);
            if (clustersResponse.success && clustersResponse.data) {
              const clusters = (clustersResponse.data as any[]).map(c => ({
                ...c,
                projectId: project.id,
                projectName: project.name,
                orgId: org.id,
                orgName: org.name,
              }));
              allClusters.push(...clusters);
            }
          }
        }
      }

      return allClusters;
    },
    refetchInterval: 10000,
  });
}


