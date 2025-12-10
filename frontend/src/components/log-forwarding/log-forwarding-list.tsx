'use client';

import { useState } from 'react';
import { useLogForwardingConfigs, useDeleteLogForwarding, useToggleLogForwarding, useTestLogForwarding } from '@/hooks/use-log-forwarding';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Cloud,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { formatDate, formatBytes } from '@/lib/utils';

interface LogForwardingListProps {
  projectId: string;
  clusterId: string;
  onCreateClick?: () => void;
}

const destinationIcons: Record<string, string> = {
  s3: '🪣',
  azure_blob: '☁️',
  gcs: '🌐',
  datadog: '🐕',
  splunk: '🔍',
  sumologic: '📊',
  webhook: '🔗',
};

export function LogForwardingList({ projectId, clusterId, onCreateClick }: LogForwardingListProps) {
  const [deleteConfig, setDeleteConfig] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

  const { data: configs, isLoading } = useLogForwardingConfigs(projectId, clusterId);
  const deleteMutation = useDeleteLogForwarding();
  const toggleMutation = useToggleLogForwarding();
  const testMutation = useTestLogForwarding();

  const handleToggle = async (configId: string, enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ projectId, clusterId, configId, enabled });
      toast({ title: enabled ? 'Log forwarding enabled' : 'Log forwarding disabled' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleTest = async (configId: string, name: string) => {
    try {
      const result = await testMutation.mutateAsync({ projectId, clusterId, configId });
      if (result.success) {
        toast({
          title: 'Connection successful',
          description: `${result.message} (${result.latencyMs}ms)`,
        });
      } else {
        toast({ title: 'Connection failed', description: result.message, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Test failed', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfig) return;
    try {
      await deleteMutation.mutateAsync({ projectId, clusterId, configId: deleteConfig.id });
      toast({ title: 'Configuration deleted' });
      setDeleteConfig(null);
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

  if (!configs || configs.length === 0) {
    return (
      <EmptyState
        icon={<Cloud className="h-12 w-12" />}
        title="No log forwarding configured"
        description="Forward your MongoDB logs to external monitoring services for analysis."
        action={
          <Button onClick={onCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            Configure Log Forwarding
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          Add Destination
        </Button>
      </div>

      {configs.map((config: any) => (
        <Card key={config.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-3xl">{destinationIcons[config.destinationType] || '📤'}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{config.name}</span>
                    <Badge variant="outline">{config.destinationType}</Badge>
                    {config.enabled ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Log types: {config.logTypes?.join(', ') || 'mongodb'}
                    {config.logsForwardedCount > 0 && (
                      <span className="ml-2">
                        • {config.logsForwardedCount.toLocaleString()} logs sent
                        ({formatBytes(config.bytesForwardedTotal || 0)})
                      </span>
                    )}
                  </div>
                  {config.lastError && (
                    <div className="text-sm text-red-600 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3" />
                      Last error: {config.lastError}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(config.id, config.name)}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="ml-1">Test</span>
                </Button>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => handleToggle(config.id, checked)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteConfig({ id: config.id, name: config.name })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <ConfirmDialog
        open={!!deleteConfig}
        onOpenChange={() => setDeleteConfig(null)}
        title="Delete Log Forwarding"
        description={`Are you sure you want to delete "${deleteConfig?.name}"? Logs will no longer be forwarded to this destination.`}
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}


