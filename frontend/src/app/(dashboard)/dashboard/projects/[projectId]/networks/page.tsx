'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  Network,
  Plus,
  Trash2,
  Server,
  Globe,
  Lock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link2,
  MapPin,
} from 'lucide-react';

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'bg-gray-100 text-gray-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  creating: { color: 'bg-blue-100 text-blue-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  active: { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  updating: { color: 'bg-yellow-100 text-yellow-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  failed: { color: 'bg-red-100 text-red-800', icon: <AlertCircle className="h-3 w-3" /> },
};

const regionLabels: Record<string, string> = {
  fsn1: '🇩🇪 Falkenstein',
  nbg1: '🇩🇪 Nuremberg',
  hel1: '🇫🇮 Helsinki',
};

export default function PrivateNetworksPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteNetwork, setDeleteNetwork] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('fsn1');
  const [ipRange, setIpRange] = useState('10.0.0.0/16');

  const { data: networks, isLoading } = useQuery({
    queryKey: ['private-networks', projectId],
    queryFn: async () => {
      const res = await apiClient.get(`/projects/${projectId}/networks`);
      return res.success ? res.data : [];
    },
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/projects/${projectId}/networks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-networks', projectId] });
      toast({ title: 'Network created', description: 'Private network is being provisioned' });
      setShowCreateForm(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (networkId: string) => apiClient.delete(`/projects/${projectId}/networks/${networkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-networks', projectId] });
      toast({ title: 'Network deleted' });
      setDeleteNetwork(null);
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setRegion('fsn1');
    setIpRange('10.0.0.0/16');
  };

  const handleCreate = () => {
    if (!name || !ipRange) {
      toast({ title: 'Error', description: 'Name and IP range are required', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ name, description, region, ipRange });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Private Networks"
        description="Manage VPC networks for secure cluster connectivity"
      />

      {showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Private Network</CardTitle>
            <CardDescription>
              Create a Hetzner private network for secure internal communication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Network Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="production-network"
                />
              </div>
              <div className="space-y-2">
                <Label>Region *</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fsn1">🇩🇪 Falkenstein, Germany</SelectItem>
                    <SelectItem value="nbg1">🇩🇪 Nuremberg, Germany</SelectItem>
                    <SelectItem value="hel1">🇫🇮 Helsinki, Finland</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>IP Range (CIDR) *</Label>
                <Input
                  value={ipRange}
                  onChange={(e) => setIpRange(e.target.value)}
                  placeholder="10.0.0.0/16"
                />
                <p className="text-xs text-muted-foreground">
                  Private IP range for your network (e.g., 10.0.0.0/16)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Production database network"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowCreateForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Network
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Network
            </Button>
          </div>

          {!networks || networks.length === 0 ? (
            <EmptyState
              icon={<Network className="h-12 w-12" />}
              title="No private networks"
              description="Create a private network to enable secure, isolated connectivity for your clusters."
              action={
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Private Network
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4">
              {networks.map((network: any) => {
                const status = statusConfig[network.status] || statusConfig.pending;
                return (
                  <Card key={network.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Network className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">{network.name}</span>
                              <Badge className={status.color}>
                                {status.icon}
                                <span className="ml-1 capitalize">{network.status}</span>
                              </Badge>
                            </div>
                            {network.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {network.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                {regionLabels[network.region]}
                              </span>
                              <span className="flex items-center gap-1">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                {network.ipRange}
                              </span>
                              <span className="flex items-center gap-1">
                                <Server className="h-4 w-4 text-muted-foreground" />
                                {network.connectedClusters?.length || 0} clusters
                              </span>
                              <span className="flex items-center gap-1">
                                <Link2 className="h-4 w-4 text-muted-foreground" />
                                {network.subnets?.length || 0} subnets
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteNetwork({ id: network.id, name: network.name })}
                            disabled={network.connectedClusters?.length > 0}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {/* Subnets */}
                      {network.subnets?.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="text-sm font-medium mb-2">Subnets</h4>
                          <div className="flex flex-wrap gap-2">
                            {network.subnets.map((subnet: any) => (
                              <Badge key={subnet.id} variant="outline">
                                {subnet.name}: {subnet.ipRange}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Peering */}
                      {network.peeringConnections?.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="text-sm font-medium mb-2">Peering Connections</h4>
                          <div className="flex flex-wrap gap-2">
                            {network.peeringConnections.map((peer: any) => (
                              <Badge
                                key={peer.id}
                                variant={peer.status === 'active' ? 'default' : 'secondary'}
                              >
                                <Link2 className="h-3 w-3 mr-1" />
                                {peer.name} ({peer.peerIpRange})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteNetwork}
        onOpenChange={() => setDeleteNetwork(null)}
        title="Delete Private Network"
        description={`Are you sure you want to delete "${deleteNetwork?.name}"? This action cannot be undone.`}
        onConfirm={() => deleteNetwork && deleteMutation.mutate(deleteNetwork.id)}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}


