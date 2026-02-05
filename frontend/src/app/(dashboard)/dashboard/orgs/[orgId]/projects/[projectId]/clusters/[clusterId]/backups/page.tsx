'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { 
  Plus, 
  Archive, 
  Trash2, 
  RotateCcw,
  Download,
  Clock,
  HardDrive,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
} from 'lucide-react';

interface Backup {
  id: string;
  name: string;
  description?: string;
  type: 'manual' | 'scheduled' | 'automated';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'restoring' | 'deleted';
  sizeBytes: number;
  compressedSizeBytes: number;
  retentionDays: number;
  expiresAt?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  metadata?: {
    databases?: string[];
    collections?: number;
    documents?: number;
    indexes?: number;
  };
  createdAt: string;
}

interface BackupStats {
  totalBackups: number;
  completedBackups: number;
  failedBackups: number;
  totalSizeBytes: number;
  lastBackupAt?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'pending':
    case 'in_progress':
    case 'restoring':
      return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
    default:
      return <Archive className="h-4 w-4" />;
  }
}

function getStatusBadge(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    failed: 'destructive',
    pending: 'secondary',
    in_progress: 'secondary',
    restoring: 'secondary',
    deleted: 'outline',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="capitalize">
      {status.replace('_', ' ')}
    </Badge>
  );
}

export default function BackupsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteBackupId, setDeleteBackupId] = useState<string | null>(null);
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null);
  const [newBackup, setNewBackup] = useState({
    name: '',
    description: '',
    retentionDays: 7,
  });

  // Fetch backups
  const { data: backups, isLoading } = useQuery({
    queryKey: ['backups', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/backups`);
      return response.data.data as Backup[];
    },
    enabled: !!projectId,
    refetchInterval: 10000, // Refetch every 10 seconds to see backup progress
  });

  // Fetch backup stats
  const { data: stats } = useQuery({
    queryKey: ['backup-stats', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/backups/stats`);
      return response.data.data as BackupStats;
    },
    enabled: !!projectId,
  });

  // Create backup mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newBackup) => {
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/backups`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['backup-stats', clusterId] });
      setShowCreateForm(false);
      setNewBackup({ name: '', description: '', retentionDays: 7 });
      toast({
        title: 'Backup started',
        description: 'Your backup is being created.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create backup',
        variant: 'destructive',
      });
    },
  });

  // Delete backup mutation
  const deleteMutation = useMutation({
    mutationFn: async (backupId: string) => {
      await apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/backups/${backupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['backup-stats', clusterId] });
      setDeleteBackupId(null);
      toast({ title: 'Backup deleted' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete backup',
        variant: 'destructive',
      });
    },
  });

  // Restore backup mutation
  const restoreMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/backups/${backupId}/restore`,
        { restoreToSource: true }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups', clusterId] });
      setRestoreBackupId(null);
      toast({
        title: 'Restore started',
        description: 'Your data is being restored from the backup.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to restore backup',
        variant: 'destructive',
      });
    },
  });

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
        title="Backups"
        description="Manage database backups and restore points"
        action={
          !showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Backup
            </Button>
          )
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Archive className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalBackups}</div>
                  <div className="text-sm text-muted-foreground">Total Backups</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.completedBackups}</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{formatBytes(stats.totalSizeBytes)}</div>
                  <div className="text-sm text-muted-foreground">Total Size</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div>
                  <div className="text-sm font-medium">
                    {stats.lastBackupAt
                      ? new Date(stats.lastBackupAt).toLocaleDateString()
                      : 'Never'}
                  </div>
                  <div className="text-sm text-muted-foreground">Last Backup</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Backup Form */}
      {showCreateForm && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Create Manual Backup
            </CardTitle>
            <CardDescription>
              Create a snapshot of your database. This may take a few minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(newBackup);
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Backup Name</Label>
                  <Input
                    id="name"
                    placeholder={`Backup ${new Date().toISOString().split('T')[0]}`}
                    value={newBackup.name}
                    onChange={(e) => setNewBackup({ ...newBackup, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retention">Retention (days)</Label>
                  <Input
                    id="retention"
                    type="number"
                    min={1}
                    max={365}
                    value={newBackup.retentionDays}
                    onChange={(e) => setNewBackup({ ...newBackup, retentionDays: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Backup before deployment..."
                  value={newBackup.description}
                  onChange={(e) => setNewBackup({ ...newBackup, description: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <LoadingSpinner className="h-4 w-4 mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Backup'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Backups List */}
      {backups && backups.length > 0 ? (
        <div className="space-y-4">
          {backups.map((backup) => (
            <Card key={backup.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      {getStatusIcon(backup.status)}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {backup.name}
                        {getStatusBadge(backup.status)}
                        <Badge variant="outline" className="text-xs capitalize">
                          {backup.type}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {backup.description || 'No description'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Created {new Date(backup.createdAt).toLocaleString()}
                        {backup.completedAt && (
                          <> • Completed {new Date(backup.completedAt).toLocaleString()}</>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {backup.status === 'completed' && (
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatBytes(backup.sizeBytes)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(backup.compressedSizeBytes)} compressed
                        </div>
                        {backup.metadata && (
                          <div className="text-xs text-muted-foreground">
                            {backup.metadata.collections} collections, {backup.metadata.documents?.toLocaleString()} docs
                          </div>
                        )}
                      </div>
                    )}

                    {backup.status === 'failed' && backup.errorMessage && (
                      <div className="text-right max-w-[200px]">
                        <div className="text-xs text-destructive truncate">{backup.errorMessage}</div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {backup.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRestoreBackupId(backup.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                      )}
                      {!['pending', 'in_progress', 'restoring'].includes(backup.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteBackupId(backup.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Archive className="h-12 w-12" />}
          title="No backups yet"
          description="Create your first backup to protect your data"
          action={
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Backup
            </Button>
          }
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteBackupId}
        onClose={() => setDeleteBackupId(null)}
        onConfirm={() => deleteBackupId && deleteMutation.mutate(deleteBackupId)}
        title="Delete Backup"
        description="Are you sure you want to delete this backup? This action cannot be undone."
        confirmText="Delete Backup"
        isDestructive
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        open={!!restoreBackupId}
        onClose={() => setRestoreBackupId(null)}
        onConfirm={() => restoreBackupId && restoreMutation.mutate(restoreBackupId)}
        title="Restore from Backup"
        description="This will restore your cluster to the state at the time of this backup. Current data will be overwritten. Are you sure?"
        confirmText="Restore"
        isDestructive
        isLoading={restoreMutation.isPending}
      />
    </div>
  );
}





