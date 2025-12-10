'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RealtimeMetricsDashboard } from '@/components/metrics/realtime-metrics-dashboard';
import { apiClient } from '@/lib/api-client';
import { 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Users,
  Activity,
  ArrowDownUp,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wifi,
} from 'lucide-react';

interface CurrentMetrics {
  cpu: number;
  memory: number;
  storageUsed: number;
  storageAvailable: number;
  connectionsCurrent: number;
  connectionsAvailable: number;
  operationsPerSec: number;
  networkIn: number;
  networkOut: number;
  lastUpdated: string;
}

interface MetricDataPoint {
  timestamp: string;
  value: number;
}

interface ClusterMetrics {
  cpu: MetricDataPoint[];
  memory: MetricDataPoint[];
  storage: { used: MetricDataPoint[]; available: MetricDataPoint[] };
  connections: { current: MetricDataPoint[]; available: MetricDataPoint[] };
  operations: {
    insert: MetricDataPoint[];
    query: MetricDataPoint[];
    update: MetricDataPoint[];
    delete: MetricDataPoint[];
  };
  network: { in: MetricDataPoint[]; out: MetricDataPoint[] };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatBytesPerSec(bytes: number): string {
  return formatBytes(bytes) + '/s';
}

function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  color,
  trend,
  max,
}: {
  title: string;
  value: number;
  unit?: string;
  icon: React.ElementType;
  color: string;
  trend?: 'up' | 'down' | 'stable';
  max?: number;
}) {
  const percentage = max ? (value / max) * 100 : value;
  const isWarning = percentage > 70;
  const isCritical = percentage > 90;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{title}</div>
              <div className="text-2xl font-bold">
                {typeof value === 'number' ? value.toFixed(1) : value}
                {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
              </div>
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-1 ${
              trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-muted-foreground'
            }`}>
              {trend === 'up' && <TrendingUp className="h-4 w-4" />}
              {trend === 'down' && <TrendingDown className="h-4 w-4" />}
            </div>
          )}
        </div>
        {max && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{percentage.toFixed(0)}% used</span>
              <span>of {typeof max === 'number' && max > 1000 ? formatBytes(max) : max}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniChart({ data, color }: { data: MetricDataPoint[]; color: string }) {
  if (!data || data.length === 0) {
    return <div className="h-16 flex items-center justify-center text-muted-foreground text-xs">No data</div>;
  }

  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((d.value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="w-full h-16" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function MetricsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const [period, setPeriod] = useState<'1h' | '6h' | '24h' | '7d' | '30d'>('24h');
  const [activeTab, setActiveTab] = useState<'realtime' | 'historical'>('realtime');

  // Fetch current metrics
  const { data: current, isLoading: loadingCurrent, refetch: refetchCurrent } = useQuery({
    queryKey: ['metrics-current', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/metrics/current`);
      return response.data.data as CurrentMetrics | null;
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch historical metrics
  const { data: historical, isLoading: loadingHistorical, refetch: refetchHistorical } = useQuery({
    queryKey: ['metrics-historical', clusterId, period],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/metrics?period=${period}`);
      return response.data.data as ClusterMetrics;
    },
    enabled: !!projectId,
  });

  const handleRefresh = () => {
    refetchCurrent();
    refetchHistorical();
  };

  if (loadingCurrent || loadingHistorical) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metrics"
        description="Monitor your cluster's performance"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="realtime" className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Real-time
            </TabsTrigger>
            <TabsTrigger value="historical">Historical</TabsTrigger>
          </TabsList>

          {activeTab === 'historical' && (
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-input">
                {(['1h', '6h', '24h', '7d', '30d'] as const).map((p) => (
                  <Button
                    key={p}
                    variant={period === p ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none first:rounded-l-md last:rounded-r-md"
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Real-time Tab */}
        <TabsContent value="realtime" className="mt-4">
          <RealtimeMetricsDashboard clusterId={clusterId} projectId={projectId} />
        </TabsContent>

        {/* Historical Tab */}
        <TabsContent value="historical" className="mt-4">

      {/* Current Metrics */}
      {current ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="CPU Usage"
              value={current.cpu}
              unit="%"
              icon={Cpu}
              color="bg-blue-500"
              max={100}
            />
            <MetricCard
              title="Memory Usage"
              value={current.memory}
              unit="%"
              icon={MemoryStick}
              color="bg-purple-500"
              max={100}
            />
            <MetricCard
              title="Storage Used"
              value={current.storageUsed}
              unit=""
              icon={HardDrive}
              color="bg-amber-500"
              max={current.storageAvailable + current.storageUsed}
            />
            <MetricCard
              title="Connections"
              value={current.connectionsCurrent}
              unit=""
              icon={Users}
              color="bg-green-500"
              max={current.connectionsAvailable}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-500" />
                  Operations
                </CardTitle>
                <CardDescription>Database operations per second</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{current.operationsPerSec}</div>
                <div className="text-sm text-muted-foreground">ops/sec</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowDownUp className="h-5 w-5 text-cyan-500" />
                  Network I/O
                </CardTitle>
                <CardDescription>Current network throughput</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xl font-bold">{formatBytesPerSec(current.networkIn)}</div>
                    <div className="text-sm text-muted-foreground">Inbound</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{formatBytesPerSec(current.networkOut)}</div>
                    <div className="text-sm text-muted-foreground">Outbound</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(current.lastUpdated).toLocaleString()}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No metrics available yet</p>
              <p className="text-sm">Metrics will appear once the cluster is running</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historical Charts */}
      {historical && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Historical Data ({period})</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniChart data={historical.cpu} color="#3b82f6" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniChart data={historical.memory} color="#a855f7" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Connections</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniChart data={historical.connections.current} color="#22c55e" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Query Operations</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniChart data={historical.operations.query} color="#f97316" />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

