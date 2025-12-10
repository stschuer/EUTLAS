'use client';

import { useState } from 'react';
import { 
  usePitrConfig, 
  usePitrRestoreWindow, 
  useOplogStats,
  useEnablePitr, 
  useDisablePitr,
  useCreatePitrRestore,
  usePitrRestoreHistory
} from '@/hooks/use-pitr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn, formatDate, formatBytes } from '@/lib/utils';
import { 
  Clock, 
  Database, 
  HardDrive, 
  History, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Play,
  Pause,
  CalendarIcon,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface PitrPanelProps {
  projectId: string;
  clusterId: string;
  clusterName: string;
}

const statusColors: Record<string, string> = {
  healthy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const restoreStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  preparing: 'bg-blue-100 text-blue-800',
  restoring_snapshot: 'bg-blue-100 text-blue-800',
  applying_oplog: 'bg-blue-100 text-blue-800',
  verifying: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export function PitrPanel({ projectId, clusterId, clusterName }: PitrPanelProps) {
  const [retentionDays, setRetentionDays] = useState(7);
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('12:00');
  
  const { toast } = useToast();
  
  const { data: config, isLoading: configLoading } = usePitrConfig(projectId, clusterId);
  const { data: window, isLoading: windowLoading } = usePitrRestoreWindow(projectId, clusterId);
  const { data: stats, isLoading: statsLoading } = useOplogStats(projectId, clusterId);
  const { data: restoreHistory } = usePitrRestoreHistory(projectId, clusterId);
  
  const enablePitr = useEnablePitr();
  const disablePitr = useDisablePitr();
  const createRestore = useCreatePitrRestore();

  const isEnabled = config?.enabled || false;

  const handleEnablePitr = async () => {
    try {
      await enablePitr.mutateAsync({
        projectId,
        clusterId,
        retentionDays,
        settings: {
          compressionEnabled: true,
          encryptionEnabled: true,
        },
      });
      toast({
        title: 'PITR Enabled',
        description: `Point-in-Time Recovery enabled with ${retentionDays} day retention`,
      });
      setEnableDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDisablePitr = async () => {
    try {
      await disablePitr.mutateAsync({ projectId, clusterId });
      toast({
        title: 'PITR Disabled',
        description: 'Point-in-Time Recovery has been disabled',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleCreateRestore = async () => {
    if (!selectedDate) {
      toast({
        title: 'Select a restore point',
        description: 'Please select a date and time to restore to',
        variant: 'destructive',
      });
      return;
    }

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const restorePoint = new Date(selectedDate);
    restorePoint.setHours(hours, minutes, 0, 0);

    try {
      await createRestore.mutateAsync({
        projectId,
        clusterId,
        restorePointTimestamp: restorePoint.toISOString(),
      });
      toast({
        title: 'Restore Initiated',
        description: `Restoring to ${restorePoint.toLocaleString()}`,
      });
      setRestoreDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (configLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* PITR Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Point-in-Time Recovery
              </CardTitle>
              <CardDescription>
                Restore your cluster to any point within the retention window
              </CardDescription>
            </div>
            <Badge className={cn(statusColors[window?.status || 'inactive'])}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!isEnabled ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Enable Point-in-Time Recovery</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Continuously capture database changes to restore your cluster to any second 
                within your retention window. Ideal for accidental data loss recovery.
              </p>
              <Dialog open={enableDialogOpen} onOpenChange={setEnableDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Play className="h-4 w-4 mr-2" />
                    Enable PITR
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enable Point-in-Time Recovery</DialogTitle>
                    <DialogDescription>
                      Configure continuous backup for cluster "{clusterName}"
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 py-4">
                    <div>
                      <Label className="mb-2 block">Retention Period: {retentionDays} days</Label>
                      <Slider
                        value={[retentionDays]}
                        onValueChange={([value]) => setRetentionDays(value)}
                        min={1}
                        max={35}
                        step={1}
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        You can restore to any point within the last {retentionDays} days
                      </p>
                    </div>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Storage Usage</AlertTitle>
                      <AlertDescription>
                        PITR uses additional storage for oplog data. Storage costs scale with 
                        write activity and retention period.
                      </AlertDescription>
                    </Alert>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEnableDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleEnablePitr} disabled={enablePitr.isPending}>
                      {enablePitr.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Enable PITR
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Restore Window */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    Oldest Restore Point
                  </div>
                  <div className="font-mono text-sm">
                    {window?.oldestRestorePoint 
                      ? formatDate(window.oldestRestorePoint)
                      : 'Building...'}
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    Latest Restore Point
                  </div>
                  <div className="font-mono text-sm">
                    {window?.latestRestorePoint 
                      ? formatDate(window.latestRestorePoint)
                      : 'Building...'}
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <HardDrive className="h-4 w-4" />
                    Storage Used
                  </div>
                  <div className="font-mono text-sm">
                    {formatBytes(window?.storageSizeBytes || 0)}
                  </div>
                </div>
              </div>

              {/* Oplog Stats */}
              {stats && (
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Oplog Statistics
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Entries:</span>
                      <span className="ml-2 font-mono">{stats.totalEntries.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Inserts:</span>
                      <span className="ml-2 font-mono text-green-600">
                        {stats.entriesByOperation?.inserts?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Updates:</span>
                      <span className="ml-2 font-mono text-blue-600">
                        {stats.entriesByOperation?.updates?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Deletes:</span>
                      <span className="ml-2 font-mono text-red-600">
                        {stats.entriesByOperation?.deletes?.toLocaleString() || 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-4">
                <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <History className="h-4 w-4 mr-2" />
                      Restore to Point-in-Time
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Restore to Point-in-Time</DialogTitle>
                      <DialogDescription>
                        Select the exact date and time to restore your cluster to
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label className="mb-2 block">Select Date</Label>
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => {
                            if (!window?.oldestRestorePoint || !window?.latestRestorePoint) return true;
                            const oldest = new Date(window.oldestRestorePoint);
                            const latest = new Date(window.latestRestorePoint);
                            return date < oldest || date > latest;
                          }}
                          className="rounded-md border"
                        />
                      </div>
                      <div>
                        <Label className="mb-2 block">Select Time</Label>
                        <Input
                          type="time"
                          value={selectedTime}
                          onChange={(e) => setSelectedTime(e.target.value)}
                          step="1"
                        />
                      </div>
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Warning</AlertTitle>
                        <AlertDescription>
                          This will restore your cluster to the selected point in time. 
                          All changes made after this point will be lost. This action cannot be undone.
                        </AlertDescription>
                      </Alert>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={handleCreateRestore}
                        disabled={!selectedDate || createRestore.isPending}
                      >
                        {createRestore.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Start Restore
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" onClick={handleDisablePitr} disabled={disablePitr.isPending}>
                  {disablePitr.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4 mr-2" />
                  )}
                  Disable PITR
                </Button>
              </div>

              {/* Configuration */}
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Retention:</span> {config?.retentionDays} days
                {config?.settings?.compressionEnabled && (
                  <Badge variant="outline" className="ml-2">Compressed</Badge>
                )}
                {config?.settings?.encryptionEnabled && (
                  <Badge variant="outline" className="ml-2">Encrypted</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore History */}
      {restoreHistory && restoreHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Restore History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {restoreHistory.map((restore: any) => (
                <div 
                  key={restore.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Badge className={cn(restoreStatusColors[restore.status])}>
                      {restore.status.replace(/_/g, ' ')}
                    </Badge>
                    <div>
                      <div className="text-sm font-medium">
                        Restore to {formatDate(restore.restorePointTimestamp)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Started: {formatDate(restore.createdAt)}
                      </div>
                    </div>
                  </div>
                  {['pending', 'preparing', 'restoring_snapshot', 'applying_oplog', 'verifying'].includes(restore.status) && (
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <div className="text-muted-foreground">{restore.currentStep}</div>
                        <Progress value={restore.progress} className="w-32 mt-1" />
                      </div>
                    </div>
                  )}
                  {restore.status === 'completed' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {restore.status === 'failed' && (
                    <div className="text-sm text-red-500">{restore.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


