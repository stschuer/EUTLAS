'use client';

import { useRealtimeMetrics } from '@/hooks/use-realtime-metrics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Users,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface RealtimeMetricsDashboardProps {
  clusterId: string;
  projectId: string;
}

const getProgressColor = (value: number): string => {
  if (value >= 90) return 'bg-red-500';
  if (value >= 75) return 'bg-yellow-500';
  return 'bg-green-500';
};

const getTrend = (history: number[]): 'up' | 'down' | 'stable' => {
  if (history.length < 2) return 'stable';
  const recent = history.slice(-5);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const last = recent[recent.length - 1];
  if (last > avg * 1.1) return 'up';
  if (last < avg * 0.9) return 'down';
  return 'stable';
};

export function RealtimeMetricsDashboard({ clusterId, projectId }: RealtimeMetricsDashboardProps) {
  const { connected, metrics, metricsHistory, alerts, lastUpdate, reconnect } = useRealtimeMetrics(clusterId);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  useEffect(() => {
    if (metrics) {
      setCpuHistory(prev => [...prev, metrics.cpuPercent].slice(-30));
      setMemHistory(prev => [...prev, metrics.memoryPercent].slice(-30));
    }
  }, [metrics]);

  const cpuTrend = getTrend(cpuHistory);
  const memTrend = getTrend(memHistory);

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600">Live</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600">Disconnected</span>
            </>
          )}
          {lastUpdate && (
            <span className="text-xs text-muted-foreground ml-2">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={reconnect}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reconnect
        </Button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 3).map((alert, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {alert.severity}
                    </Badge>
                    <span className="ml-2">{alert.metric}: {alert.value.toFixed(1)}%</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                CPU Usage
              </span>
              {cpuTrend === 'up' && <ArrowUpRight className="h-4 w-4 text-red-500" />}
              {cpuTrend === 'down' && <ArrowDownRight className="h-4 w-4 text-green-500" />}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics?.cpuPercent?.toFixed(1) || '--'}%
            </div>
            <Progress 
              value={metrics?.cpuPercent || 0} 
              className="mt-2 h-2"
            />
            {/* Mini sparkline */}
            <div className="flex items-end gap-px h-8 mt-2">
              {cpuHistory.slice(-20).map((val, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${getProgressColor(val)}`}
                  style={{ height: `${Math.max(val, 5)}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MemoryStick className="h-4 w-4" />
                Memory Usage
              </span>
              {memTrend === 'up' && <ArrowUpRight className="h-4 w-4 text-red-500" />}
              {memTrend === 'down' && <ArrowDownRight className="h-4 w-4 text-green-500" />}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics?.memoryPercent?.toFixed(1) || '--'}%
            </div>
            <Progress 
              value={metrics?.memoryPercent || 0} 
              className="mt-2 h-2"
            />
            <div className="flex items-end gap-px h-8 mt-2">
              {memHistory.slice(-20).map((val, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${getProgressColor(val)}`}
                  style={{ height: `${Math.max(val, 5)}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics?.storagePercent?.toFixed(1) || '--'}%
            </div>
            <Progress 
              value={metrics?.storagePercent || 0} 
              className="mt-2 h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Used storage
            </p>
          </CardContent>
        </Card>

        {/* Connections */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics?.connections || '--'}
              <span className="text-lg text-muted-foreground">
                /{metrics?.maxConnections || '--'}
              </span>
            </div>
            <Progress 
              value={metrics ? (metrics.connections / metrics.maxConnections) * 100 : 0} 
              className="mt-2 h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Active connections
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Operations per Second
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {metrics?.operationsPerSec?.insert?.toFixed(0) || 0}
              </div>
              <div className="text-sm text-muted-foreground">Inserts</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {metrics?.operationsPerSec?.query?.toFixed(0) || 0}
              </div>
              <div className="text-sm text-muted-foreground">Queries</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {metrics?.operationsPerSec?.update?.toFixed(0) || 0}
              </div>
              <div className="text-sm text-muted-foreground">Updates</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {metrics?.operationsPerSec?.delete?.toFixed(0) || 0}
              </div>
              <div className="text-sm text-muted-foreground">Deletes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network I/O */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Network In
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? formatBytes(metrics.networkBytesIn) : '--'}/s
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              Network Out
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? formatBytes(metrics.networkBytesOut) : '--'}/s
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



