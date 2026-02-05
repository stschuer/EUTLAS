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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Bell, 
  Plus, 
  Mail,
  Webhook,
  MessageSquare,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'webhook' | 'slack';
  config: {
    emails?: string[];
    webhookUrl?: string;
    slackWebhookUrl?: string;
    slackChannel?: string;
  };
  enabled: boolean;
  failureCount: number;
  lastError?: string;
  lastUsedAt?: string;
  createdAt: string;
}

const typeIcons: Record<string, any> = {
  email: Mail,
  webhook: Webhook,
  slack: MessageSquare,
};

const typeLabels: Record<string, string> = {
  email: 'Email',
  webhook: 'Webhook',
  slack: 'Slack',
};

export default function NotificationsPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);

  const [newChannel, setNewChannel] = useState({
    name: '',
    type: 'email' as 'email' | 'webhook' | 'slack',
    config: {
      emails: [''],
      webhookUrl: '',
      slackWebhookUrl: '',
      slackChannel: '',
    },
  });

  // Fetch channels
  const { data: channels, isLoading } = useQuery({
    queryKey: ['notification-channels', orgId],
    queryFn: async () => {
      try {
        const response = await apiClient.get(`/orgs/${orgId}/notification-channels`);
        return (response.data ?? []) as NotificationChannel[];
      } catch {
        console.warn('Failed to load notification channels');
        return [] as NotificationChannel[];
      }
    },
  });

  // Create channel mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      // Build config based on type
      let config: any = {};
      if (data.type === 'email') {
        config = { emails: data.config.emails.filter((e: string) => e.trim()) };
      } else if (data.type === 'webhook') {
        config = { webhookUrl: data.config.webhookUrl };
      } else if (data.type === 'slack') {
        config = { 
          slackWebhookUrl: data.config.slackWebhookUrl,
          slackChannel: data.config.slackChannel || undefined,
        };
      }
      
      const response = await apiClient.post(`/orgs/${orgId}/notification-channels`, {
        name: data.name,
        type: data.type,
        config,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels', orgId] });
      setShowCreateDialog(false);
      setNewChannel({
        name: '', type: 'email',
        config: { emails: [''], webhookUrl: '', slackWebhookUrl: '', slackChannel: '' },
      });
      toast({ title: 'Notification channel created' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create channel', variant: 'destructive' });
    },
  });

  // Delete channel mutation
  const deleteMutation = useMutation({
    mutationFn: async (channelId: string) => {
      await apiClient.delete(`/orgs/${orgId}/notification-channels/${channelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels', orgId] });
      setDeleteChannelId(null);
      toast({ title: 'Notification channel deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to delete channel', variant: 'destructive' });
    },
  });

  // Test channel mutation
  const testMutation = useMutation({
    mutationFn: async (channelId: string) => {
      setTestingChannelId(channelId);
      const response = await apiClient.post(`/orgs/${orgId}/notification-channels/${channelId}/test`, {});
      return response.data;
    },
    onSuccess: (data) => {
      setTestingChannelId(null);
      if (data.success) {
        toast({ title: 'Test notification sent!' });
      } else {
        toast({ title: 'Test failed', description: data.error, variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      setTestingChannelId(null);
      toast({ title: 'Error', description: error.response?.data?.message || 'Test failed', variant: 'destructive' });
    },
  });

  // Toggle enabled mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ channelId, enabled }: { channelId: string; enabled: boolean }) => {
      await apiClient.patch(`/orgs/${orgId}/notification-channels/${channelId}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels', orgId] });
      toast({ title: 'Channel updated' });
    },
  });

  const addEmailField = () => {
    setNewChannel({
      ...newChannel,
      config: { ...newChannel.config, emails: [...newChannel.config.emails, ''] },
    });
  };

  const updateEmail = (index: number, value: string) => {
    const emails = [...newChannel.config.emails];
    emails[index] = value;
    setNewChannel({ ...newChannel, config: { ...newChannel.config, emails } });
  };

  const removeEmail = (index: number) => {
    const emails = newChannel.config.emails.filter((_, i) => i !== index);
    setNewChannel({ ...newChannel, config: { ...newChannel.config, emails } });
  };

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
        title="Notification Channels"
        description="Configure how you receive alert notifications"
        actions={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Notification Channel</DialogTitle>
                <DialogDescription>
                  Create a new channel to receive alert notifications.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(newChannel);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Ops Team Email"
                    value={newChannel.name}
                    onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={newChannel.type}
                    onValueChange={(v: any) => setNewChannel({ ...newChannel, type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email
                        </div>
                      </SelectItem>
                      <SelectItem value="webhook">
                        <div className="flex items-center gap-2">
                          <Webhook className="h-4 w-4" />
                          Webhook
                        </div>
                      </SelectItem>
                      <SelectItem value="slack">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Slack
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Email Config */}
                {newChannel.type === 'email' && (
                  <div className="space-y-2">
                    <Label>Email Addresses</Label>
                    {newChannel.config.emails.map((email, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={email}
                          onChange={(e) => updateEmail(index, e.target.value)}
                          required={index === 0}
                        />
                        {index > 0 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeEmail(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addEmailField}>
                      <Plus className="h-4 w-4 mr-1" /> Add Email
                    </Button>
                  </div>
                )}

                {/* Webhook Config */}
                {newChannel.type === 'webhook' && (
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <Input
                      type="url"
                      placeholder="https://example.com/webhook"
                      value={newChannel.config.webhookUrl}
                      onChange={(e) => setNewChannel({
                        ...newChannel,
                        config: { ...newChannel.config, webhookUrl: e.target.value },
                      })}
                      required
                    />
                  </div>
                )}

                {/* Slack Config */}
                {newChannel.type === 'slack' && (
                  <>
                    <div className="space-y-2">
                      <Label>Slack Webhook URL</Label>
                      <Input
                        type="url"
                        placeholder="https://hooks.slack.com/services/..."
                        value={newChannel.config.slackWebhookUrl}
                        onChange={(e) => setNewChannel({
                          ...newChannel,
                          config: { ...newChannel.config, slackWebhookUrl: e.target.value },
                        })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Channel (optional)</Label>
                      <Input
                        placeholder="#alerts"
                        value={newChannel.config.slackChannel}
                        onChange={(e) => setNewChannel({
                          ...newChannel,
                          config: { ...newChannel.config, slackChannel: e.target.value },
                        })}
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Channel'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {channels && channels.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {channels.map((channel) => {
            const Icon = typeIcons[channel.type];
            return (
              <Card key={channel.id} className={!channel.enabled ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    {channel.name}
                    {!channel.enabled && <Badge variant="secondary">Disabled</Badge>}
                    {channel.failureCount >= 3 && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Failing
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{typeLabels[channel.type]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-4">
                    {channel.type === 'email' && (
                      <>{channel.config.emails?.join(', ')}</>
                    )}
                    {channel.type === 'webhook' && (
                      <span className="font-mono text-xs">{channel.config.webhookUrl}</span>
                    )}
                    {channel.type === 'slack' && (
                      <>{channel.config.slackChannel || 'Default channel'}</>
                    )}
                  </div>

                  {channel.lastError && (
                    <div className="text-xs text-destructive mb-4 p-2 bg-destructive/10 rounded">
                      Last error: {channel.lastError}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {channel.lastUsedAt
                        ? `Last used ${new Date(channel.lastUsedAt).toLocaleDateString()}`
                        : 'Never used'}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(channel.id)}
                        disabled={testingChannelId === channel.id}
                      >
                        {testingChannelId === channel.id ? (
                          <LoadingSpinner className="h-4 w-4" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ channelId: channel.id, enabled: !channel.enabled })}
                      >
                        {channel.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteChannelId(channel.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Bell className="h-12 w-12" />}
          title="No notification channels"
          description="Add a channel to receive alert notifications."
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          }
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteChannelId}
        onClose={() => setDeleteChannelId(null)}
        onConfirm={() => deleteChannelId && deleteMutation.mutate(deleteChannelId)}
        title="Delete Notification Channel"
        description="Are you sure you want to delete this channel? You will no longer receive notifications through it."
        confirmText="Delete Channel"
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}





