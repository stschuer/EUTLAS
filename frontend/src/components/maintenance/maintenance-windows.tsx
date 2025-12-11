'use client';

import { useState } from 'react';
import {
  useMaintenanceWindows,
  useUpcomingMaintenance,
  useMaintenanceHistory,
  useCancelMaintenanceWindow,
  useDeferMaintenanceWindow,
} from '@/hooks/use-maintenance';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Calendar,
  Clock,
  Plus,
  XCircle,
  FastForward,
  CheckCircle,
  AlertTriangle,
  Loader2,
  History,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils';

interface MaintenanceWindowsProps {
  projectId: string;
  clusterId: string;
  onCreateClick?: () => void;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  scheduled: { color: 'bg-blue-100 text-blue-800', icon: <Calendar className="h-3 w-3" /> },
  in_progress: { color: 'bg-yellow-100 text-yellow-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { color: 'bg-gray-100 text-gray-800', icon: <XCircle className="h-3 w-3" /> },
  failed: { color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-3 w-3" /> },
};

const dayLabels: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export function MaintenanceWindows({ projectId, clusterId, onCreateClick }: MaintenanceWindowsProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<{ id: string; title: string } | null>(null);
  const [deferDialog, setDeferDialog] = useState<{ id: string; title: string } | null>(null);
  const [deferDays, setDeferDays] = useState('1');
  const { toast } = useToast();

  const { data: windows, isLoading } = useMaintenanceWindows(projectId, clusterId);
  const { data: upcoming } = useUpcomingMaintenance(projectId, clusterId);
  const { data: history } = useMaintenanceHistory(projectId, clusterId);
  const cancelMutation = useCancelMaintenanceWindow();
  const deferMutation = useDeferMaintenanceWindow();

  const handleCancel = async () => {
    if (!cancelDialog) return;
    try {
      await cancelMutation.mutateAsync({
        projectId,
        clusterId,
        windowId: cancelDialog.id,
      });
      toast({ title: 'Maintenance cancelled' });
      setCancelDialog(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDefer = async () => {
    if (!deferDialog) return;
    try {
      await deferMutation.mutateAsync({
        projectId,
        clusterId,
        windowId: deferDialog.id,
        days: parseInt(deferDays),
      });
      toast({ title: 'Maintenance deferred', description: `Postponed by ${deferDays} days` });
      setDeferDialog(null);
      setDeferDays('1');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
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
      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setShowHistory(!showHistory)}>
          <History className="h-4 w-4 mr-2" />
          {showHistory ? 'Hide History' : 'Show History'}
        </Button>
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          Schedule Maintenance
        </Button>
      </div>

      {/* Upcoming Maintenance Alert */}
      {upcoming && upcoming.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Upcoming Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcoming.slice(0, 3).map((w: any) => (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <span>{w.title}</span>
                  <span className="text-muted-foreground">
                    {w.scheduledStartTime ? formatDateTime(w.scheduledStartTime) : `${dayLabels[w.dayOfWeek]} ${w.startHour}:00`}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Windows List */}
      {!windows || windows.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title="No maintenance windows"
          description="Schedule a preferred time for maintenance operations."
          action={
            <Button onClick={onCreateClick}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Maintenance Window
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {windows.map((window: any) => {
            const status = statusConfig[window.status] || statusConfig.scheduled;
            return (
              <Card key={window.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{window.title}</span>
                          <Badge className={status.color}>
                            {status.icon}
                            <span className="ml-1 capitalize">{window.status.replace('_', ' ')}</span>
                          </Badge>
                          {window.type === 'emergency' && (
                            <Badge variant="destructive">Emergency</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <span className="capitalize">{window.dayOfWeek}</span>s at {window.startHour}:00 ({window.timezone})
                          <span className="mx-2">•</span>
                          {window.durationHours} hour{window.durationHours > 1 ? 's' : ''}
                        </div>
                        {window.scheduledStartTime && (
                          <div className="text-sm text-muted-foreground">
                            Next: {formatDateTime(window.scheduledStartTime)}
                          </div>
                        )}
                        {window.requiresDowntime && (
                          <div className="text-sm text-yellow-600 flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            Requires downtime (~{window.estimatedDowntimeMinutes} min)
                          </div>
                        )}
                      </div>
                    </div>
                    {window.status === 'scheduled' && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeferDialog({ id: window.id, title: window.title })}
                        >
                          <FastForward className="h-4 w-4 mr-1" />
                          Defer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCancelDialog({ id: window.id, title: window.title })}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* History */}
      {showHistory && history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Maintenance History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((w: any) => {
                const status = statusConfig[w.status] || statusConfig.scheduled;
                return (
                  <div key={w.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <div className="font-medium">{w.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {w.actualStartTime ? formatDateTime(w.actualStartTime) : formatDate(w.createdAt)}
                      </div>
                    </div>
                    <Badge className={status.color}>
                      {status.icon}
                      <span className="ml-1 capitalize">{w.status}</span>
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={!!cancelDialog}
        onOpenChange={() => setCancelDialog(null)}
        title="Cancel Maintenance Window"
        description={`Are you sure you want to cancel "${cancelDialog?.title}"?`}
        onConfirm={handleCancel}
        confirmText="Cancel Window"
        variant="destructive"
        loading={cancelMutation.isPending}
      />

      {/* Defer Dialog */}
      <Dialog open={!!deferDialog} onOpenChange={() => setDeferDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Defer Maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Postpone "{deferDialog?.title}" to a later date.
            </p>
            <div className="space-y-2">
              <Label>Defer by</Label>
              <Select value={deferDays} onValueChange={setDeferDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="2">2 days</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">1 week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeferDialog(null)}>Cancel</Button>
            <Button onClick={handleDefer} disabled={deferMutation.isPending}>
              {deferMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Defer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



