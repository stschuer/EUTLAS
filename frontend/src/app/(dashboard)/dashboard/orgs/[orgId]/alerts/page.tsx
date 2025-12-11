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
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Settings,
  Activity,
  Cpu,
  HardDrive,
  Users,
} from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metricType: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  evaluationPeriodMinutes: number;
  cooldownMinutes: number;
  lastTriggeredAt?: string;
  notificationChannels: { id: string; name: string; type: string }[];
}

interface AlertHistory {
  id: string;
  alertName: string;
  metricType: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved' | 'acknowledged';
  threshold: number;
  currentValue: number;
  message: string;
  firedAt: string;
  resolvedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: { firstName: string; lastName: string };
}

interface AlertStats {
  totalFiring: number;
  totalAcknowledged: number;
  totalResolved24h: number;
  bySeverity: { info: number; warning: number; critical: number };
}

const metricOptions = [
  { value: 'cpu_usage', label: 'CPU Usage', icon: Cpu, unit: '%' },
  { value: 'memory_usage', label: 'Memory Usage', icon: Activity, unit: '%' },
  { value: 'storage_usage', label: 'Storage Usage', icon: HardDrive, unit: '%' },
  { value: 'connections', label: 'Connections', icon: Users, unit: '' },
];

const conditionLabels: Record<string, string> = {
  gt: '> (greater than)',
  gte: '>= (at or above)',
  lt: '< (less than)',
  lte: '<= (at or below)',
  eq: '= (equals)',
};

const severityColors: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const severityIcons: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const statusColors: Record<string, string> = {
  firing: 'bg-red-500',
  acknowledged: 'bg-yellow-500',
  resolved: 'bg-green-500',
};

export default function AlertsPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [acknowledgeAlertId, setAcknowledgeAlertId] = useState<string | null>(null);
  const [acknowledgeNote, setAcknowledgeNote] = useState('');

  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    metricType: 'cpu_usage',
    condition: 'gt',
    threshold: 80,
    severity: 'warning',
    evaluationPeriodMinutes: 5,
    cooldownMinutes: 60,
  });

  // Fetch alert rules
  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ['alert-rules', orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/orgs/${orgId}/alerts/rules`);
      return response.data.data as AlertRule[];
    },
  });

  // Fetch alert history
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['alert-history', orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/orgs/${orgId}/alerts/history?limit=50`);
      return response.data.data as AlertHistory[];
    },
    refetchInterval: 30000,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['alert-stats', orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/orgs/${orgId}/alerts/history/stats`);
      return response.data.data as AlertStats;
    },
    refetchInterval: 30000,
  });

  // Create rule mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newRule) => {
      const response = await apiClient.post(`/orgs/${orgId}/alerts/rules`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules', orgId] });
      setShowCreateDialog(false);
      setNewRule({
        name: '', description: '', metricType: 'cpu_usage', condition: 'gt',
        threshold: 80, severity: 'warning', evaluationPeriodMinutes: 5, cooldownMinutes: 60,
      });
      toast({ title: 'Alert rule created' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create rule', variant: 'destructive' });
    },
  });

  // Delete rule mutation
  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      await apiClient.delete(`/orgs/${orgId}/alerts/rules/${ruleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules', orgId] });
      setDeleteRuleId(null);
      toast({ title: 'Alert rule deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to delete rule', variant: 'destructive' });
    },
  });

  // Toggle rule mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      await apiClient.patch(`/orgs/${orgId}/alerts/rules/${ruleId}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules', orgId] });
      toast({ title: 'Alert rule updated' });
    },
  });

  // Acknowledge alert mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async ({ alertId, note }: { alertId: string; note: string }) => {
      await apiClient.post(`/orgs/${orgId}/alerts/history/${alertId}/acknowledge`, { note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-history', orgId] });
      queryClient.invalidateQueries({ queryKey: ['alert-stats', orgId] });
      setAcknowledgeAlertId(null);
      setAcknowledgeNote('');
      toast({ title: 'Alert acknowledged' });
    },
  });

  if (loadingRules || loadingHistory) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  const firingAlerts = history?.filter(a => a.status === 'firing') || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Monitor and manage alert rules and notifications"
        action={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Alert Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Alert Rule</DialogTitle>
                <DialogDescription>
                  Define conditions that trigger alerts and notifications.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(newRule);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="High CPU Alert"
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Metric</Label>
                    <Select value={newRule.metricType} onValueChange={(v) => setNewRule({ ...newRule, metricType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {metricOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select value={newRule.condition} onValueChange={(v) => setNewRule({ ...newRule, condition: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(conditionLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Threshold</Label>
                    <Input
                      type="number"
                      value={newRule.threshold}
                      onChange={(e) => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select value={newRule.severity} onValueChange={(v) => setNewRule({ ...newRule, severity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Rule'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className={firingAlerts.length > 0 ? 'border-red-500/50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${firingAlerts.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                <div>
                  <div className="text-2xl font-bold">{stats.totalFiring}</div>
                  <div className="text-sm text-muted-foreground">Active Alerts</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalAcknowledged}</div>
                  <div className="text-sm text-muted-foreground">Acknowledged</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalResolved24h}</div>
                  <div className="text-sm text-muted-foreground">Resolved (24h)</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-red-500/10">🚨 {stats.bySeverity.critical}</Badge>
                <Badge variant="outline" className="bg-yellow-500/10">⚠️ {stats.bySeverity.warning}</Badge>
                <Badge variant="outline" className="bg-blue-500/10">ℹ️ {stats.bySeverity.info}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-2">By Severity</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            Active Alerts {firingAlerts.length > 0 && <Badge variant="destructive" className="ml-2">{firingAlerts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {firingAlerts.length > 0 ? (
            firingAlerts.map((alert) => {
              const SeverityIcon = severityIcons[alert.severity];
              return (
                <Card key={alert.id} className="border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <SeverityIcon className={`h-5 w-5 ${alert.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'}`} />
                        <div>
                          <div className="font-medium">{alert.alertName}</div>
                          <div className="text-sm text-muted-foreground">{alert.message}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Fired {new Date(alert.firedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => setAcknowledgeAlertId(alert.id)}>
                        Acknowledge
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
              title="All clear!"
              description="No active alerts at the moment."
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history && history.length > 0 ? (
            history.map((alert) => (
              <Card key={alert.id} className={`border-l-4 border-l-${statusColors[alert.status].replace('bg-', '')}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${statusColors[alert.status]}`} />
                      <div>
                        <div className="font-medium">{alert.alertName}</div>
                        <div className="text-sm text-muted-foreground">{alert.message}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="capitalize">{alert.status}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(alert.firedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={<Bell className="h-12 w-12" />}
              title="No alert history"
              description="Alerts will appear here when triggered."
            />
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          {rules && rules.length > 0 ? (
            rules.map((rule) => (
              <Card key={rule.id} className={!rule.enabled ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${severityColors[rule.severity]}`}>
                        {severityIcons[rule.severity] && 
                          (() => { const Icon = severityIcons[rule.severity]; return <Icon className="h-5 w-5" />; })()
                        }
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {rule.name}
                          {!rule.enabled && <Badge variant="secondary">Disabled</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {rule.metricType.replace(/_/g, ' ')} {conditionLabels[rule.condition].split(' ')[0]} {rule.threshold}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ ruleId: rule.id, enabled: !rule.enabled })}
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteRuleId(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={<Settings className="h-12 w-12" />}
              title="No alert rules"
              description="Create your first alert rule to start monitoring."
              action={
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Alert Rule
                </Button>
              }
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Acknowledge Dialog */}
      <Dialog open={!!acknowledgeAlertId} onOpenChange={(open) => !open && setAcknowledgeAlertId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Alert</DialogTitle>
            <DialogDescription>
              Mark this alert as acknowledged. You can add an optional note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                placeholder="Looking into it..."
                value={acknowledgeNote}
                onChange={(e) => setAcknowledgeNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAcknowledgeAlertId(null)}>Cancel</Button>
              <Button onClick={() => acknowledgeAlertId && acknowledgeMutation.mutate({ alertId: acknowledgeAlertId, note: acknowledgeNote })}>
                Acknowledge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteRuleId}
        onClose={() => setDeleteRuleId(null)}
        onConfirm={() => deleteRuleId && deleteMutation.mutate(deleteRuleId)}
        title="Delete Alert Rule"
        description="Are you sure you want to delete this alert rule? This action cannot be undone."
        confirmText="Delete Rule"
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}



