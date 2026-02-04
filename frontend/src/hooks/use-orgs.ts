"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orgsApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";

/**
 * Organizations hooks
 */

export function useOrgs() {
  return useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const response = await orgsApi.list();
      if (response.success && response.data) {
        return response.data as any[];
      }
      // Don't throw on 401 - let the API client handle logout
      // The API client will trigger logout via the unauthorized handler
      if (response.error?.code === "UNAUTHORIZED") {
        // Return empty array to prevent error state, logout will be handled by API client
        return [];
      }
      throw new Error(response.error?.message || "Failed to load organizations");
    },
    retry: (failureCount, error: any) => {
      // Don't retry on 401/UNAUTHORIZED errors - they indicate auth failure
      if (error?.message?.includes("UNAUTHORIZED") || failureCount >= 1) {
        return false;
      }
      return true;
    },
  });
}

export function useOrg(orgId: string) {
  return useQuery({
    queryKey: ["orgs", orgId],
    queryFn: async () => {
      const response = await orgsApi.get(orgId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to load organization");
    },
    enabled: !!orgId,
  });
}

export function useCreateOrg() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await orgsApi.create(data);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error?.message || "Failed to create organization");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      toast({
        title: "Organization created!",
        description: "Your organization has been created successfully.",
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

export function useDeleteOrg() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orgId: string) => {
      const response = await orgsApi.delete(orgId);
      if (!response.success) {
        throw new Error(response.error?.message || "Failed to delete organization");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      toast({
        title: "Organization deleted",
        description: "The organization has been deleted.",
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





