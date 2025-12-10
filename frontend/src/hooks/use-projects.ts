"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";

/**
 * Projects hooks
 */

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const response = await projectsApi.list(orgId);
      if (response.success && response.data) {
        return response.data as any[];
      }
      throw new Error(response.error?.message || "Failed to load projects");
    },
    enabled: !!orgId,
  });
}

export function useProject(orgId: string, projectId: string) {
  return useQuery({
    queryKey: ["projects", orgId, projectId],
    queryFn: async () => {
      const response = await projectsApi.get(orgId, projectId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to load project");
    },
    enabled: !!orgId && !!projectId,
  });
}

export function useCreateProject(orgId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await projectsApi.create(orgId, data);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to create project");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", orgId] });
      toast({
        title: "Project created!",
        description: "Your project has been created successfully.",
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

export function useDeleteProject(orgId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await projectsApi.delete(orgId, projectId);
      if (!response.success) {
        throw new Error(response.error?.message || "Failed to delete project");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", orgId] });
      toast({
        title: "Project deleted",
        description: "The project has been deleted.",
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
 * Get all projects across all orgs
 */
export function useAllProjects() {
  return useQuery({
    queryKey: ["allProjects"],
    queryFn: async () => {
      // First get all orgs
      const orgsResponse = await import("@/lib/api-client").then(m => m.orgsApi.list());
      if (!orgsResponse.success || !orgsResponse.data) {
        throw new Error("Failed to load organizations");
      }

      const orgs = orgsResponse.data as any[];
      
      // Then get projects for each org
      const projectPromises = orgs.map(async (org) => {
        const projResponse = await projectsApi.list(org.id);
        if (projResponse.success && projResponse.data) {
          return (projResponse.data as any[]).map(p => ({ ...p, orgId: org.id, orgName: org.name }));
        }
        return [];
      });

      const projectArrays = await Promise.all(projectPromises);
      return projectArrays.flat();
    },
  });
}


