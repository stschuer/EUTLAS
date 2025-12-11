'use client';

import { useState } from 'react';
import { useSearchIndexes, useDeleteSearchIndex, useSearchIndexStats } from '@/hooks/use-search-indexes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  Search,
  Plus,
  Trash2,
  Settings,
  Database,
  Zap,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Play,
} from 'lucide-react';
import Link from 'next/link';

interface SearchIndexListProps {
  projectId: string;
  clusterId: string;
  onCreateClick?: () => void;
  onTestClick?: (indexId: string) => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="h-4 w-4" />, color: 'bg-gray-100 text-gray-800', label: 'Pending' },
  building: { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'bg-blue-100 text-blue-800', label: 'Building' },
  ready: { icon: <CheckCircle className="h-4 w-4" />, color: 'bg-green-100 text-green-800', label: 'Ready' },
  failed: { icon: <AlertCircle className="h-4 w-4" />, color: 'bg-red-100 text-red-800', label: 'Failed' },
  deleting: { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'bg-gray-100 text-gray-800', label: 'Deleting' },
};

export function SearchIndexList({ projectId, clusterId, onCreateClick, onTestClick }: SearchIndexListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteIndex, setDeleteIndex] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

  const { data: indexes, isLoading } = useSearchIndexes(projectId, clusterId);
  const { data: stats } = useSearchIndexStats(projectId, clusterId);
  const deleteMutation = useDeleteSearchIndex();

  const filteredIndexes = (indexes || []).filter((index: any) =>
    index.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    index.database.toLowerCase().includes(searchTerm.toLowerCase()) ||
    index.collection.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteIndex) return;
    try {
      await deleteMutation.mutateAsync({
        projectId,
        clusterId,
        indexId: deleteIndex.id,
      });
      toast({ title: 'Index deleted', description: `"${deleteIndex.name}" is being deleted` });
      setDeleteIndex(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalIndexes}</div>
              <p className="text-sm text-muted-foreground">Total Indexes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.byStatus?.ready || 0}</div>
              <p className="text-sm text-muted-foreground">Ready</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalQueries?.toLocaleString() || 0}</div>
              <p className="text-sm text-muted-foreground">Total Queries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{formatBytes(stats.totalStorageBytes || 0)}</div>
              <p className="text-sm text-muted-foreground">Storage Used</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search indexes..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          Create Index
        </Button>
      </div>

      {/* Index List */}
      {filteredIndexes.length === 0 ? (
        <EmptyState
          icon={<Search className="h-12 w-12" />}
          title="No search indexes"
          description="Create a search index to enable full-text search on your collections."
          action={
            <Button onClick={onCreateClick}>
              <Plus className="h-4 w-4 mr-2" />
              Create Search Index
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredIndexes.map((index: any) => {
            const status = statusConfig[index.status] || statusConfig.pending;
            return (
              <Card key={index.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${index.type === 'vectorSearch' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                        {index.type === 'vectorSearch' ? (
                          <Zap className="h-5 w-5 text-purple-600" />
                        ) : (
                          <Search className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{index.name}</span>
                          <Badge className={status.color}>
                            {status.icon}
                            <span className="ml-1">{status.label}</span>
                          </Badge>
                          <Badge variant="outline">{index.type}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          <Database className="h-3 w-3" />
                          {index.database}.{index.collection}
                          {index.documentCount !== undefined && (
                            <span>• {index.documentCount.toLocaleString()} docs</span>
                          )}
                          {index.queryCount !== undefined && index.queryCount > 0 && (
                            <span>• {index.queryCount.toLocaleString()} queries</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {index.status === 'ready' && onTestClick && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTestClick(index.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteIndex({ id: index.id, name: index.name })}
                        disabled={index.status === 'deleting'}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteIndex}
        onOpenChange={() => setDeleteIndex(null)}
        title="Delete Search Index"
        description={`Are you sure you want to delete "${deleteIndex?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}



