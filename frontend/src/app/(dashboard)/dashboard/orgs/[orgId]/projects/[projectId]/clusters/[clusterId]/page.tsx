"use client";

import { useParams, useRouter } from "next/navigation";
import { useCluster, useClusterCredentials } from "@/hooks/use-clusters";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ClusterStatusBadge } from "@/components/ui/status-badge";
import { ConnectionStringBuilder } from "@/components/clusters/connection-string-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Server, Clock, Database, HardDrive, Users, Network, Pause, Play, Settings, Archive, Activity, FileJson, Gauge, History, Search, TrendingUp, Cloud, Calendar, Cog, FileCheck, Shield, Compass, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";

/**
 * Cluster Details Page
 */

const planDetails: Record<string, { ram: string; storage: string; price: number }> = {
  DEV: { ram: "512MB", storage: "5GB", price: 9 },
  SMALL: { ram: "1GB", storage: "20GB", price: 29 },
  MEDIUM: { ram: "2GB", storage: "50GB", price: 59 },
  LARGE: { ram: "4GB", storage: "100GB", price: 119 },
  XLARGE: { ram: "8GB", storage: "200GB", price: 229 },
};

export default function ClusterDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;
  const clusterId = params.clusterId as string;

  // If no projectId provided, we'd need to look it up
  // For now, this will show an error state
  const { data: cluster, isLoading: clusterLoading, error: clusterError } = useCluster(projectId, clusterId);
  const { data: credentials, isLoading: credentialsLoading } = useClusterCredentials(projectId, clusterId);

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/projects/${projectId}/clusters/${clusterId}/pause`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster', projectId, clusterId] });
      toast({ title: 'Cluster pausing', description: 'Cluster pause initiated. Data will be preserved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to pause cluster', variant: 'destructive' });
    },
  });

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/projects/${projectId}/clusters/${clusterId}/resume`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster', projectId, clusterId] });
      toast({ title: 'Cluster resuming', description: 'Cluster is being resumed.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to resume cluster', variant: 'destructive' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/projects/${projectId}/clusters/${clusterId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters', projectId] });
      toast({ title: 'Cluster deleted', description: 'Cluster has been deleted successfully.' });
      router.push(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete cluster', variant: 'destructive' });
    },
  });

  if (clusterLoading) {
    return <PageLoading message="Loading cluster details..." />;
  }

  if (clusterError || !cluster) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">Failed to load cluster</p>
        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters`}>
          <Button variant="outline">Back to Clusters</Button>
        </Link>
      </div>
    );
  }

  const plan = planDetails[(cluster as any).plan] || planDetails.MEDIUM;

  return (
    <div className="space-y-6">
      <PageHeader
        title={(cluster as any).name}
        breadcrumbs={[
          { label: "Clusters", href: `/dashboard/orgs/${orgId}/projects/${projectId}/clusters` },
          { label: (cluster as any).name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <ClusterStatusBadge status={(cluster as any).status} />
            <ConfirmDialog
              title="Delete Cluster"
              description={`Are you sure you want to delete "${(cluster as any).name}"? This action cannot be undone and all data will be permanently lost.`}
              confirmText="Delete"
              variant="destructive"
              onConfirm={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
            >
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </ConfirmDialog>
          </div>
        }
      />

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(cluster as any).plan}</div>
            <p className="text-sm text-muted-foreground">
              €{plan.price}/month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Resources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plan.ram} RAM</div>
            <p className="text-sm text-muted-foreground">
              {plan.storage} Storage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Created
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {formatDateTime((cluster as any).createdAt)}
            </div>
            <p className="text-sm text-muted-foreground">
              MongoDB {(cluster as any).mongoVersion}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/database-users`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Users</div>
                  <div className="text-sm text-muted-foreground">DB access</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/network`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Network className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <div className="font-medium">Network</div>
                  <div className="text-sm text-muted-foreground">IP whitelist</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/backups`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Archive className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="font-medium">Backups</div>
                  <div className="text-sm text-muted-foreground">Snapshots</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/metrics`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-cyan-500" />
                </div>
                <div>
                  <div className="font-medium">Metrics</div>
                  <div className="text-sm text-muted-foreground">Monitoring</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/explorer`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <FileJson className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <div className="font-medium">Explorer</div>
                  <div className="text-sm text-muted-foreground">Browse data</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/performance`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                  <Gauge className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <div className="font-medium">Advisor</div>
                  <div className="text-sm text-muted-foreground">Performance</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/pitr?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <History className="h-5 w-5 text-indigo-500" />
                </div>
                <div>
                  <div className="font-medium">PITR</div>
                  <div className="text-sm text-muted-foreground">Point-in-Time</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/search-indexes?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <div className="font-medium">Search</div>
                  <div className="text-sm text-muted-foreground">Atlas Search</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/scaling?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <div className="font-medium">Scaling</div>
                  <div className="text-sm text-muted-foreground">Recommendations</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/logs?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <Cloud className="h-5 w-5 text-sky-500" />
                </div>
                <div>
                  <div className="font-medium">Logs</div>
                  <div className="text-sm text-muted-foreground">Forwarding</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/maintenance?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <div className="font-medium">Maintenance</div>
                  <div className="text-sm text-muted-foreground">Windows</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/archive?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Archive className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="font-medium">Archive</div>
                  <div className="text-sm text-muted-foreground">Online Archive</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/schemas`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <FileCheck className="h-5 w-5 text-pink-500" />
                </div>
                <div>
                  <div className="font-medium">Schemas</div>
                  <div className="text-sm text-muted-foreground">Validation</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/backups`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-teal-500" />
                </div>
                <div>
                  <div className="font-medium">Policy</div>
                  <div className="text-sm text-muted-foreground">Compliance</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/settings?clusterName=${encodeURIComponent((cluster as any).name)}`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
                  <Cog className="h-5 w-5 text-slate-500" />
                </div>
                <div>
                  <div className="font-medium">Settings</div>
                  <div className="text-sm text-muted-foreground">Configuration</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {(cluster as any).status === 'ready' && (
          <Card 
            className="hover:bg-accent/50 transition-colors cursor-pointer h-full"
            onClick={() => pauseMutation.mutate()}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Pause className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <div className="font-medium">Pause</div>
                  <div className="text-sm text-muted-foreground">Save costs</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {(cluster as any).status === 'paused' && (
          <Card 
            className="hover:bg-accent/50 transition-colors cursor-pointer h-full"
            onClick={() => resumeMutation.mutate()}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Play className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <div className="font-medium">Resume</div>
                  <div className="text-sm text-muted-foreground">Start again</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full opacity-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">Settings</div>
                <div className="text-sm text-muted-foreground">Soon</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection Details */}
      {credentials && (cluster as any).status === 'ready' ? (
        <ConnectionStringBuilder
          clusterName={(cluster as any).name}
          credentials={{
            connectionString: (credentials as any).connectionString,
            host: (credentials as any).host,
            port: (credentials as any).port,
            username: (credentials as any).username,
            password: (credentials as any).password,
          }}
        />
      ) : credentialsLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Connection Details</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Loading credentials...</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Status Info */}
      {(cluster as any).status === "creating" && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse" />
              <div>
                <p className="font-medium">Cluster is being provisioned</p>
                <p className="text-sm text-muted-foreground">
                  This usually takes 2-5 minutes. The page will update automatically.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(cluster as any).status === "failed" && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-destructive" />
              <div>
                <p className="font-medium text-destructive">Cluster provisioning failed</p>
                <p className="text-sm text-muted-foreground">
                  Please contact support or try creating a new cluster.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(cluster as any).status === "paused" && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Pause className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium text-blue-600 dark:text-blue-400">Cluster is paused</p>
                <p className="text-sm text-muted-foreground">
                  Your data is preserved. Resume the cluster to restore connections.
                </p>
              </div>
              <Button 
                className="ml-auto" 
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {((cluster as any).status === "pausing" || (cluster as any).status === "resuming") && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-yellow-500 animate-pulse" />
              <div>
                <p className="font-medium">
                  {(cluster as any).status === "pausing" ? "Cluster is pausing..." : "Cluster is resuming..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  This usually takes 1-2 minutes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

