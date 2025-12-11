'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { 
  Plus, 
  Trash2, 
  Shield, 
  Globe,
  Network,
  Clock,
  AlertTriangle,
  Wifi,
} from 'lucide-react';

interface IpWhitelistEntry {
  id: string;
  cidrBlock: string;
  comment?: string;
  isTemporary: boolean;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

export default function NetworkAccessPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const projectId = params.projectId as string || 'default';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [showAllowAnywhere, setShowAllowAnywhere] = useState(false);
  const [newEntry, setNewEntry] = useState({
    cidrBlock: '',
    comment: '',
    isTemporary: false,
    expiresAt: '',
  });

  // Fetch IP whitelist
  const { data, isLoading, error } = useQuery({
    queryKey: ['ip-whitelist', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/network/whitelist`);
      return response.data.data as IpWhitelistEntry[];
    },
  });

  // Create entry mutation
  const createMutation = useMutation({
    mutationFn: async (entryData: typeof newEntry) => {
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/network/whitelist`,
        entryData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-whitelist', clusterId] });
      setShowCreateForm(false);
      setNewEntry({ cidrBlock: '', comment: '', isTemporary: false, expiresAt: '' });
      toast({
        title: 'IP added',
        description: 'IP address has been whitelisted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add IP',
        variant: 'destructive',
      });
    },
  });

  // Add current IP mutation
  const addCurrentIpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/network/whitelist/add-current-ip`
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ip-whitelist', clusterId] });
      toast({
        title: 'IP added',
        description: data.message || 'Your current IP has been whitelisted.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add current IP',
        variant: 'destructive',
      });
    },
  });

  // Allow anywhere mutation
  const allowAnywhereMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/network/whitelist/allow-anywhere`
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ip-whitelist', clusterId] });
      setShowAllowAnywhere(false);
      toast({
        title: 'Access opened',
        description: data.message,
        variant: 'destructive',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to allow access',
        variant: 'destructive',
      });
    },
  });

  // Delete entry mutation
  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/network/whitelist/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-whitelist', clusterId] });
      setDeleteEntryId(null);
      toast({
        title: 'Entry removed',
        description: 'IP whitelist entry has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to remove entry',
        variant: 'destructive',
      });
    },
  });

  const hasAllowAnywhere = data?.some((entry) => entry.cidrBlock === '0.0.0.0/0');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Access"
        description="Control which IP addresses can connect to this cluster"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => addCurrentIpMutation.mutate()}
              disabled={addCurrentIpMutation.isPending}
            >
              <Wifi className="h-4 w-4 mr-2" />
              Add Current IP
            </Button>
            {!showCreateForm && (
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add IP Address
              </Button>
            )}
          </div>
        }
      />

      {/* Warning if Allow Anywhere is enabled */}
      {hasAllowAnywhere && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <div className="font-medium text-yellow-600 dark:text-yellow-400">
                  Cluster is accessible from any IP address
                </div>
                <div className="text-sm text-muted-foreground">
                  This is not recommended for production. Consider restricting access to specific IPs.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Entry Form */}
      {showCreateForm && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Add IP Address
            </CardTitle>
            <CardDescription>
              Whitelist an IP address or CIDR range to allow connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(newEntry);
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cidrBlock">IP Address / CIDR Range</Label>
                  <Input
                    id="cidrBlock"
                    placeholder="192.168.1.0/24 or 10.0.0.1/32"
                    value={newEntry.cidrBlock}
                    onChange={(e) => setNewEntry({ ...newEntry, cidrBlock: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use /32 for a single IP, /24 for a subnet
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment">Description (optional)</Label>
                  <Input
                    id="comment"
                    placeholder="Office network"
                    value={newEntry.comment}
                    onChange={(e) => setNewEntry({ ...newEntry, comment: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isTemporary"
                  checked={newEntry.isTemporary}
                  onChange={(e) => setNewEntry({ ...newEntry, isTemporary: e.target.checked })}
                  className="rounded border-input"
                />
                <Label htmlFor="isTemporary" className="text-sm font-normal">
                  Temporary access (expires automatically)
                </Label>
              </div>

              {newEntry.isTemporary && (
                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Expiration Date</Label>
                  <Input
                    id="expiresAt"
                    type="datetime-local"
                    value={newEntry.expiresAt}
                    onChange={(e) => setNewEntry({ ...newEntry, expiresAt: e.target.value })}
                    required={newEntry.isTemporary}
                  />
                </div>
              )}

              <div className="flex gap-2 justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setShowAllowAnywhere(true)}
                  disabled={hasAllowAnywhere}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  Allow from anywhere
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? (
                      <>
                        <LoadingSpinner className="h-4 w-4 mr-2" />
                        Adding...
                      </>
                    ) : (
                      'Add Entry'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Whitelist Entries */}
      {data && data.length > 0 ? (
        <div className="grid gap-4">
          {data.map((entry) => (
            <Card key={entry.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      entry.cidrBlock === '0.0.0.0/0' 
                        ? 'bg-yellow-500/10' 
                        : 'bg-green-500/10'
                    }`}>
                      {entry.cidrBlock === '0.0.0.0/0' ? (
                        <Globe className="h-5 w-5 text-yellow-500" />
                      ) : (
                        <Shield className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-mono font-medium flex items-center gap-2">
                        {entry.cidrBlock}
                        {entry.isTemporary && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Clock className="h-3 w-3" />
                            Temporary
                          </Badge>
                        )}
                        {entry.cidrBlock === '0.0.0.0/0' && (
                          <Badge variant="destructive" className="text-xs">
                            Open to Internet
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {entry.comment || 'No description'}
                        {entry.expiresAt && (
                          <span className="ml-2">
                            • Expires {new Date(entry.expiresAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteEntryId(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Network className="h-12 w-12" />}
          title="No IP addresses whitelisted"
          description="Add IP addresses to allow connections to this cluster"
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => addCurrentIpMutation.mutate()}>
                <Wifi className="h-4 w-4 mr-2" />
                Add Current IP
              </Button>
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add IP Address
              </Button>
            </div>
          }
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteEntryId}
        onClose={() => setDeleteEntryId(null)}
        onConfirm={() => deleteEntryId && deleteMutation.mutate(deleteEntryId)}
        title="Remove IP Whitelist Entry"
        description="Are you sure you want to remove this IP from the whitelist? Connections from this address will be blocked."
        confirmText="Remove Entry"
        isDestructive
        isLoading={deleteMutation.isPending}
      />

      {/* Allow Anywhere Confirmation */}
      <ConfirmDialog
        open={showAllowAnywhere}
        onClose={() => setShowAllowAnywhere(false)}
        onConfirm={() => allowAnywhereMutation.mutate()}
        title="Allow Access from Anywhere"
        description="This will allow connections from any IP address (0.0.0.0/0). This is NOT recommended for production databases as it exposes your cluster to the entire internet."
        confirmText="Allow Anyway"
        isDestructive
        isLoading={allowAnywhereMutation.isPending}
      />
    </div>
  );
}



