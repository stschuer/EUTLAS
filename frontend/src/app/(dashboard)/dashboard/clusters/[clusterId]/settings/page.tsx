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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { clusterSettingsApi } from '@/lib/api-client';
import {
  ArrowLeft,
  Tag,
  Network,
  Calendar,
  Shield,
  Plus,
  X,
  Loader2,
  Trash2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

export default function ClusterSettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const clusterName = searchParams.get('clusterName') || 'Cluster';

  // Tags state
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');
  const [newLabel, setNewLabel] = useState('');

  // Scheduled scaling state
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleCron, setScheduleCron] = useState('0 8 * * 1-5');
  const [targetPlan, setTargetPlan] = useState('MEDIUM');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['cluster-settings', projectId, clusterId],
    queryFn: async () => {
      const res = await clusterSettingsApi.get(projectId, clusterId);
      return res.success ? res.data : null;
    },
    enabled: !!projectId && !!clusterId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => clusterSettingsApi.update(projectId, clusterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster-settings', projectId, clusterId] });
      toast({ title: 'Settings updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: () => {
      const currentTags = settings?.tags ? Object.fromEntries(settings.tags) : {};
      return clusterSettingsApi.updateTags(projectId, clusterId, { ...currentTags, [newTagKey]: newTagValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster-settings', projectId, clusterId] });
      setNewTagKey('');
      setNewTagValue('');
      toast({ title: 'Tag added' });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: (key: string) => {
      const currentTags = settings?.tags ? Object.fromEntries(settings.tags) : {};
      delete currentTags[key];
      return clusterSettingsApi.updateTags(projectId, clusterId, currentTags);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster-settings', projectId, clusterId] });
      toast({ title: 'Tag removed' });
    },
  });

  const updateLabelsMutation = useMutation({
    mutationFn: (labels: string[]) => clusterSettingsApi.updateLabels(projectId, clusterId, labels),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster-settings', projectId, clusterId] });
      toast({ title: 'Labels updated' });
    },
  });

  const addScheduledScalingMutation = useMutation({
    mutationFn: () => clusterSettingsApi.addScheduledScaling(projectId, clusterId, {
      name: scheduleName,
      enabled: true,
      cronSchedule: scheduleCron,
      targetPlan,
      timezone: 'UTC',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster-settings', projectId, clusterId] });
      setScheduleName('');
      toast({ title: 'Scheduled scaling added' });
    },
  });

  const deleteScheduledScalingMutation = useMutation({
    mutationFn: (scheduleId: string) => clusterSettingsApi.deleteScheduledScaling(projectId, clusterId, scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cluster-settings', projectId, clusterId] });
      toast({ title: 'Schedule deleted' });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const tags = settings?.tags ? (typeof settings.tags === 'object' && settings.tags.constructor === Map 
    ? Object.fromEntries(settings.tags) 
    : settings.tags) : {};
  const labels = settings?.labels || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/clusters/${clusterId}?projectId=${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Cluster Settings"
          description={`Configure settings for ${clusterName}`}
        />
      </div>

      <Tabs defaultValue="tags">
        <TabsList>
          <TabsTrigger value="tags">Tags & Labels</TabsTrigger>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="scaling">Scheduled Scaling</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        {/* Tags & Labels */}
        <TabsContent value="tags" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags
              </CardTitle>
              <CardDescription>Add key-value tags to organize and identify your cluster</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(tags).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                    <span className="font-medium">{key}:</span> {value as string}
                    <button onClick={() => removeTagMutation.mutate(key)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {Object.keys(tags).length === 0 && (
                  <span className="text-sm text-muted-foreground">No tags</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Key" value={newTagKey} onChange={(e) => setNewTagKey(e.target.value)} className="max-w-[150px]" />
                <Input placeholder="Value" value={newTagValue} onChange={(e) => setNewTagValue(e.target.value)} className="max-w-[200px]" />
                <Button onClick={() => addTagMutation.mutate()} disabled={!newTagKey || !newTagValue || addTagMutation.isPending}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Tag
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
              <CardDescription>Simple labels for categorization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {labels.map((label: string) => (
                  <Badge key={label} variant="outline" className="flex items-center gap-1">
                    {label}
                    <button onClick={() => updateLabelsMutation.mutate(labels.filter((l: string) => l !== label))} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {labels.length === 0 && <span className="text-sm text-muted-foreground">No labels</span>}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="max-w-[200px]" />
                <Button onClick={() => {
                  if (newLabel && !labels.includes(newLabel)) {
                    updateLabelsMutation.mutate([...labels, newLabel]);
                    setNewLabel('');
                  }
                }} disabled={!newLabel}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Label
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connection Settings */}
        <TabsContent value="connection" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Connection Pool
              </CardTitle>
              <CardDescription>Configure connection pool settings for optimal performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Min Pool Size</Label>
                  <Input type="number" defaultValue={settings?.connectionPool?.minPoolSize || 0} min={0} max={100} />
                </div>
                <div className="space-y-2">
                  <Label>Max Pool Size</Label>
                  <Input type="number" defaultValue={settings?.connectionPool?.maxPoolSize || 100} min={1} max={500} />
                </div>
                <div className="space-y-2">
                  <Label>Connect Timeout (ms)</Label>
                  <Input type="number" defaultValue={settings?.connectionPool?.connectTimeoutMS || 10000} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Read/Write Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Read Preference</Label>
                  <Select defaultValue={settings?.readPreference || 'primary'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary</SelectItem>
                      <SelectItem value="primaryPreferred">Primary Preferred</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="secondaryPreferred">Secondary Preferred</SelectItem>
                      <SelectItem value="nearest">Nearest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Write Concern</Label>
                  <Select defaultValue={String(settings?.writeConcern?.w || 'majority')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="majority">Majority</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scheduled Scaling */}
        <TabsContent value="scaling" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Scheduled Scaling
              </CardTitle>
              <CardDescription>Automatically scale your cluster based on time schedules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings?.scheduledScaling?.length > 0 ? (
                <div className="space-y-2">
                  {settings.scheduledScaling.map((schedule: any) => (
                    <div key={schedule.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{schedule.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {schedule.cronSchedule} → {schedule.targetPlan}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={schedule.enabled ? 'default' : 'secondary'}>
                          {schedule.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => deleteScheduledScalingMutation.mutate(schedule.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No scheduled scaling rules</p>
              )}

              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium">Add Schedule</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="Scale up for business hours" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cron Schedule</Label>
                    <Input value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} placeholder="0 8 * * 1-5" />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Plan</Label>
                    <Select value={targetPlan} onValueChange={setTargetPlan}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEV">DEV</SelectItem>
                        <SelectItem value="SMALL">SMALL</SelectItem>
                        <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                        <SelectItem value="LARGE">LARGE</SelectItem>
                        <SelectItem value="XLARGE">XLARGE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => addScheduledScalingMutation.mutate()} disabled={!scheduleName || addScheduledScalingMutation.isPending}>
                  {addScheduledScalingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Plus className="h-4 w-4 mr-2" />
                  Add Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Auto-Pause
              </CardTitle>
              <CardDescription>Automatically pause cluster after inactivity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Enable Auto-Pause</div>
                  <div className="text-sm text-muted-foreground">Pause cluster after period of inactivity</div>
                </div>
                <Switch 
                  checked={settings?.autoPauseEnabled || false}
                  onCheckedChange={(checked) => updateMutation.mutate({ autoPauseEnabled: checked })}
                />
              </div>
              {settings?.autoPauseEnabled && (
                <div className="space-y-2">
                  <Label>Pause after (days of inactivity)</Label>
                  <Input 
                    type="number" 
                    defaultValue={settings?.autoPauseAfterDays || 7} 
                    min={1} 
                    max={30}
                    onChange={(e) => updateMutation.mutate({ autoPauseAfterDays: parseInt(e.target.value) })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


