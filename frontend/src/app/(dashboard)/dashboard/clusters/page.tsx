"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClusterCard } from "@/components/clusters/cluster-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAllClusters } from "@/hooks/use-clusters";
import { clustersApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Clusters Overview Page - Connected to real API
 */

export default function ClustersPage() {
  const { data: clusters, isLoading } = useAllClusters();
  const [deleteCluster, setDeleteCluster] = useState<{ id: string; projectId: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!deleteCluster) return;
    
    setIsDeleting(true);
    try {
      const response = await clustersApi.delete(deleteCluster.projectId, deleteCluster.id);
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ["allClusters"] });
        toast({
          title: "Cluster deletion started",
          description: "Your cluster is being deleted.",
        });
      } else {
        throw new Error(response.error?.message);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Could not delete cluster.",
      });
    } finally {
      setIsDeleting(false);
      setDeleteCluster(null);
    }
  };

  if (isLoading) {
    return <PageLoading message="Loading clusters..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clusters</h1>
          <p className="text-muted-foreground">
            All your MongoDB clusters across projects.
          </p>
        </div>
        <Link href="/dashboard/clusters/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Cluster
          </Button>
        </Link>
      </div>

      {/* Clusters grid */}
      {!clusters || clusters.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No clusters yet"
          description="Deploy your first MongoDB cluster to get started."
          action={{
            label: "Deploy Cluster",
            onClick: () => (window.location.href = "/dashboard/clusters/new"),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clusters.filter((c: any) => c && c.id).map((cluster: any) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              projectId={cluster.projectId || ''}
              onDelete={(id) => cluster.projectId && setDeleteCluster({ id, projectId: cluster.projectId })}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteCluster}
        onOpenChange={(open) => !open && setDeleteCluster(null)}
        title="Delete Cluster"
        description="Are you sure you want to delete this cluster? This action cannot be undone and all data will be permanently lost."
        confirmLabel="Delete Cluster"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
