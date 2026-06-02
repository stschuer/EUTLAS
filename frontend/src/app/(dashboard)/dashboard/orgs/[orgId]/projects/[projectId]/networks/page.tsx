'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { privateNetworksApi } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  Network,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Server,
  MapPin,
} from 'lucide-react';

type NetworkStatus = 'pending' | 'creating' | 'active' | 'updating' | 'deleting' | 'failed';

interface PrivateNetwork {
  id: string;
  name: string;
  description?: string;
  status: NetworkStatus;
  region: 'fsn1' | 'nbg1' | 'hel1';
  ipRange: string;
  hetznerNetworkId?: string;
  subnets?: Array<{ id: string; name: string; ipRange: string; zone: string }>;
  connectedClusters?: string[];
  peeringConnections?: Array<{ id: string; name: string; status: string }>;
  errorMessage?: string;
  createdAt: string;
}

const statusConfig: Record<NetworkStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800', icon: <Clock className="h-3 w-3" /> },
  creating: { label: 'Creating', color: 'bg-blue-100 text-blue-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  active: { label: 'Active', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  updating: { label: 'Updating', color: 'bg-yellow-100 text-yellow-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  deleting: { label: 'Deleting', color: 'bg-orange-100 text-orange-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-3 w-3" /> },
};

const regionLabels: Record<string, string> = {
  fsn1: 'Falkenstein, DE',
  nbg1: 'Nuremberg, DE',
  hel1: 'Helsinki, FI',
};

export default function PrivateNetworksPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteNetwork, setDeleteNetwork] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    region: 'fsn1' as 'fsn1' | 'nbg1' | 'hel1',
    ipRange: '10.0.0.0/16',
  });

  const { data: networks, isLoading } = useQuery({
    queryKey: ['private-networks', projectId],
    queryFn: async () => {
      const res = await privateNetworksApi.list(projectId);
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to load networks');
      }
      return (res.data || []) as PrivateNetwork[];
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data as PrivateNetwork[] | undefined;
      const hasPending = data?.some((n) => ['pending', 'creating', 'updating', 'deleting'].includes(n.status));
      return hasPending ? 5000 : false;
    },
  });

  const { data: regions } = useQuery({
    queryKey: ['private-network-regions', projectId],
    queryFn: async () => {
      const res = await privateNetworksApi.getRegions(projectId);
      return res.success ? res.data : [];
    },
    enabled: !!projectId && showCreateDialog,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      privateNetworksApi.create(projectId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        region: form.region,
        ipRange: form.ipRange.trim(),
      }),
    onSuccess: (res) => {
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to create network');
      }
      queryClient.invalidateQueries({ queryKey: ['private-networks', projectId] });
      toast({ title: 'Network created', description: 'Private network provisioning has started.' });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (networkId: string) => privateNetworksApi.delete(projectId, networkId),
    onSuccess: (res) => {
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to delete network');
      }
      queryClient.invalidateQueries({ queryKey: ['private-networks', projectId] });
      toast({ title: 'Network deleted', description: 'Network deletion has been initiated.' });
      setDeleteNetwork(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setForm({ name: '', description: '', region: 'fsn1', ipRange: '10.0.0.0/16' });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/orgs/${orgId}/projects/${projectId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Project
        </Button>
      </div>

      <PageHeader
        title="Private Networks"
        description="Configure VPC networks for secure private connectivity between clusters and your infrastructure"
        action={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Network
          </Button>
        }
      />

      {networks && networks.length > 0 ? (
        <div className="grid gap-4">
          {networks.map((network) => {
            const status = statusConfig[network.status] || statusConfig.pending;
            const subnetCount = network.subnets?.length || 0;
            const clusterCount = network.connectedClusters?.length || 0;

            return (
              <Card key={network.id} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Network className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{network.name}</CardTitle>
                          <Badge className={status.color}>
                            {status.icon}
                            <span className="ml-1">{status.label}</span>
                          </Badge>
                        </div>
                        {network.description && (
                          <CardDescription className="mt-1">{network.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteNetwork({ id: network.id, name: network.name })}
                          disabled={network.status === 'deleting'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete network</TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Region
                      </dt>
                      <dd className="font-medium mt-1">
                        {regionLabels[network.region] || network.region}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">IP Range</dt>
                      <dd className="font-mono font-medium mt-1">{network.ipRange}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Subnets</dt>
                      <dd className="font-medium mt-1">{subnetCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground flex items-center gap-1">
                        <Server className="h-3 w-3" />
                        Clusters
                      </dt>
                      <dd className="font-medium mt-1">{clusterCount}</dd>
                    </div>
                  </dl>

                  {network.hetznerNetworkId && (
                    <div className="text-xs text-muted-foreground">
                      Hetzner Network ID: <span className="font-mono">{network.hetznerNetworkId}</span>
                    </div>
                  )}

                  {network.subnets && network.subnets.length > 0 && (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-sm font-medium mb-2">Subnets</div>
                      <div className="space-y-2">
                        {network.subnets.map((subnet) => (
                          <div
                            key={subnet.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                          >
                            <span className="font-medium">{subnet.name}</span>
                            <span className="font-mono text-muted-foreground">{subnet.ipRange}</span>
                            <Badge variant="outline">{subnet.zone}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {network.errorMessage && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {network.errorMessage}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(network.createdAt)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Network className="h-12 w-12" />}
          title="No private networks"
          description="Create a VPC network to connect clusters privately within a Hetzner region"
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Network
            </Button>
          }
        />
      )}

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Cluster network access</CardTitle>
          <CardDescription>
            IP whitelisting and public/private endpoint settings are configured per cluster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}`}>
            <Button variant="outline" size="sm">
              View project clusters
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Private Network</DialogTitle>
            <DialogDescription>
              Provision a Hetzner Cloud private network for this project. Clusters can be attached after creation.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="network-name">Name</Label>
              <Input
                id="network-name"
                placeholder="production-vpc"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-description">Description (optional)</Label>
              <Input
                id="network-description"
                placeholder="Internal services connectivity"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-region">Region</Label>
              <Select
                value={form.region}
                onValueChange={(value: 'fsn1' | 'nbg1' | 'hel1') =>
                  setForm({ ...form, region: value })
                }
              >
                <SelectTrigger id="network-region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {(regions || [
                    { id: 'fsn1', name: 'Falkenstein', location: 'Germany' },
                    { id: 'nbg1', name: 'Nuremberg', location: 'Germany' },
                    { id: 'hel1', name: 'Helsinki', location: 'Finland' },
                  ]).map((region: { id: string; name: string; location: string }) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name}, {region.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-ip-range">IP Range (CIDR)</Label>
              <Input
                id="network-ip-range"
                placeholder="10.0.0.0/16"
                value={form.ipRange}
                onChange={(e) => setForm({ ...form, ipRange: e.target.value })}
                required
                pattern="^(\d{1,3}\.){3}\d{1,3}/\d{1,2}$"
              />
              <p className="text-xs text-muted-foreground">
                Private RFC1918 range, e.g. 10.0.0.0/16 or 172.16.0.0/12
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !form.name.trim()}>
                {createMutation.isPending ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Network'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteNetwork}
        onClose={() => setDeleteNetwork(null)}
        onConfirm={() => deleteNetwork && deleteMutation.mutate(deleteNetwork.id)}
        title="Delete Private Network"
        description={`Are you sure you want to delete "${deleteNetwork?.name}"? Connected clusters will be detached.`}
        confirmText="Delete Network"
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
