'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
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
import { archiveApi } from '@/lib/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  Archive,
  Plus,
  ArrowLeft,
  Trash2,
  Play,
  Pause,
  PlayCircle,
  Clock,
  Database,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

export default function OnlineArchivePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const clusterName = searchParams.get('clusterName') || 'Cluster';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteRule, setDeleteRule] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [database, setDatabase] = useState('');
  const [collection, setCollection] = useState('');
  const [dateField, setDateField] = useState('createdAt');
  const [archiveAfterDays, setArchiveAfterDays] = useState('90');
  const [storageClass, setStorageClass] = useState('standard');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['archive-rules', projectId, clusterId],
    queryFn: async () => {
      const res = await archiveApi.listRules(projectId, clusterId);
      return res.success ? res.data : [];
    },
    enabled: !!projectId && !!clusterId,
  });

  const { data: stats } = useQuery({
    queryKey: ['archive-stats', projectId, clusterId],
    queryFn: async () => {
      const res = await archiveApi.getStats(projectId, clusterId);
      return res.success ? res.data : null;
    },
    enabled: !!projectId && !!clusterId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => archiveApi.createRule(projectId, clusterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-rules', projectId, clusterId] });
      toast({ title: 'Archive rule created' });
      setShowCreateForm(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => archiveApi.deleteRule(projectId, clusterId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-rules', projectId, clusterId] });
      toast({ title: 'Archive rule deleted' });
      setDeleteRule(null);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (ruleId: string) => archiveApi.pauseRule(projectId, clusterId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-rules', projectId, clusterId] });
      toast({ title: 'Archive rule paused' });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (ruleId: string) => archiveApi.resumeRule(projectId, clusterId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-rules', projectId, clusterId] });
      toast({ title: 'Archive rule resumed' });
    },
  });

  const runMutation = useMutation({
    mutationFn: (ruleId: string) => archiveApi.runNow(projectId, clusterId, ruleId),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['archive-rules', projectId, clusterId] });
      queryClient.invalidateQueries({ queryKey: ['archive-stats', projectId, clusterId] });
      toast({ 
        title: 'Archive completed', 
        description: `Archived ${data.data.documentsArchived} documents (${formatBytes(data.data.bytesArchived)})` 
      });
    },
  });

  const resetForm = () => {
    setName('');
    setDatabase('');
    setCollection('');
    setDateField('createdAt');
    setArchiveAfterDays('90');
    setStorageClass('standard');
  };

  const handleCreate = () => {
    if (!name || !database || !collection || !dateField) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      name,
      database,
      collection,
      dateField,
      archiveAfterDays: parseInt(archiveAfterDays),
      storageClass,
    });
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/clusters/${clusterId}?projectId=${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Online Archive"
          description={`Automatically tier cold data to cheaper storage for ${clusterName}`}
        />
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalRules}</div>
              <p className="text-sm text-muted-foreground">Total Rules</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.activeRules}</div>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalDocumentsArchived.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Documents Archived</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{formatBytes(stats.totalBytesArchived)}</div>
              <p className="text-sm text-muted-foreground">Total Size</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Archive Rule</CardTitle>
            <CardDescription>Define criteria for automatically archiving old data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Archive old orders" />
              </div>
              <div className="space-y-2">
                <Label>Database *</Label>
                <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="mydb" />
              </div>
              <div className="space-y-2">
                <Label>Collection *</Label>
                <Input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="orders" />
              </div>
              <div className="space-y-2">
                <Label>Date Field *</Label>
                <Input value={dateField} onChange={(e) => setDateField(e.target.value)} placeholder="createdAt" />
              </div>
              <div className="space-y-2">
                <Label>Archive After (days)</Label>
                <Input type="number" value={archiveAfterDays} onChange={(e) => setArchiveAfterDays(e.target.value)} min="1" />
              </div>
              <div className="space-y-2">
                <Label>Storage Class</Label>
                <Select value={storageClass} onValueChange={setStorageClass}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="cold">Cold Storage (Cheaper)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowCreateForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Rule
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Archive Rule
            </Button>
          </div>

          {/* Rules List */}
          {!rules || rules.length === 0 ? (
            <EmptyState
              icon={<Archive className="h-12 w-12" />}
              title="No archive rules"
              description="Create rules to automatically archive old data and reduce storage costs."
              action={
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Archive Rule
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {rules.map((rule: any) => (
                <Card key={rule.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Archive className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{rule.name}</span>
                            <Badge variant={rule.status === 'active' ? 'default' : 'secondary'}>
                              {rule.status}
                            </Badge>
                            <Badge variant="outline">{rule.storageClass}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            <Database className="h-3 w-3" />
                            {rule.database}.{rule.collection}
                            <span>•</span>
                            <Clock className="h-3 w-3" />
                            Archive after {rule.archiveAfterDays} days
                          </div>
                          {rule.documentsArchived > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {rule.documentsArchived.toLocaleString()} docs archived ({formatBytes(rule.bytesArchived)})
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runMutation.mutate(rule.id)}
                          disabled={runMutation.isPending || rule.status !== 'active'}
                        >
                          {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                          <span className="ml-1">Run Now</span>
                        </Button>
                        {rule.status === 'active' ? (
                          <Button variant="ghost" size="icon" onClick={() => pauseMutation.mutate(rule.id)}>
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => resumeMutation.mutate(rule.id)}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setDeleteRule({ id: rule.id, name: rule.name })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteRule}
        onOpenChange={() => setDeleteRule(null)}
        title="Delete Archive Rule"
        description={`Are you sure you want to delete "${deleteRule?.name}"? Archived data will not be affected.`}
        onConfirm={() => deleteRule && deleteMutation.mutate(deleteRule.id)}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}




