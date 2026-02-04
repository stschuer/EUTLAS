'use client';

import { useState, useEffect } from 'react';
import { useActivityFeed, useActivityStats, useEventTypes, useSeverityLevels } from '@/hooks/use-activity-feed';
import { ActivityFilters, activityApi, apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, formatDate, formatBytes } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  CalendarIcon,
  AlertCircle,
  AlertTriangle,
  Info,
  Server,
  Database,
  Shield,
  Users,
  Key,
  Clock
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface ActivityFeedProps {
  orgId: string;
  projectId?: string;
  clusterId?: string;
}

const severityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const severityIcons: Record<string, React.ReactNode> = {
  info: <Info className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
};

const categoryIcons: Record<string, React.ReactNode> = {
  Cluster: <Server className="h-4 w-4" />,
  Backup: <Database className="h-4 w-4" />,
  Restore: <Clock className="h-4 w-4" />,
  Team: <Users className="h-4 w-4" />,
  Security: <Shield className="h-4 w-4" />,
  API: <Key className="h-4 w-4" />,
};

export function ActivityFeed({ orgId, projectId, clusterId }: ActivityFeedProps) {
  const [filters, setFilters] = useState<ActivityFilters>({
    projectId,
    clusterId,
    page: 1,
    limit: 25,
    sortOrder: 'desc',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
  const [realtimeEvents, setRealtimeEvents] = useState<any[]>([]);

  const { data: activityData, isLoading, refetch } = useActivityFeed(orgId, {
    ...filters,
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    severities: selectedSeverities.length > 0 ? selectedSeverities : undefined,
    search: searchTerm || undefined,
    startDate: dateRange.start?.toISOString(),
    endDate: dateRange.end?.toISOString(),
  });
  
  const { data: eventTypes } = useEventTypes(orgId);
  const { data: stats } = useActivityStats(orgId);

  // WebSocket for real-time updates
  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) return;

    const socket: Socket = io(`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')}/events`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connected', () => {
      console.log('Connected to activity feed');
      socket.emit('subscribe:org', { orgId });
    });

    socket.on('event', (event) => {
      setRealtimeEvents(prev => [event, ...prev].slice(0, 10));
    });

    return () => {
      socket.disconnect();
    };
  }, [orgId]);

  const handleExport = (format: 'json' | 'csv') => {
    const token = apiClient.getToken();
    const url = format === 'json' 
      ? activityApi.exportJson(orgId, filters)
      : activityApi.exportCsv(orgId, filters);
    
    // Download file
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `activity-feed.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const groupedTypes = eventTypes?.reduce((acc: Record<string, any[]>, type: any) => {
    if (!acc[type.category]) acc[type.category] = [];
    acc[type.category].push(type);
    return acc;
  }, {}) || {};

  const events = activityData?.data || [];
  const pagination = activityData?.pagination;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalEvents}</div>
              <p className="text-sm text-muted-foreground">Events (7 days)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-blue-600">{stats.bySeverity?.info || 0}</div>
                <Info className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground">Informational</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-yellow-600">{stats.bySeverity?.warning || 0}</div>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-red-600">{stats.bySeverity?.error || 0}</div>
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <p className="text-sm text-muted-foreground">Errors</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Real-time Events Banner */}
      {realtimeEvents.length > 0 && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="font-medium">Live:</span>
              <span className="text-muted-foreground truncate">
                {realtimeEvents[0]?.message}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  refetch();
                  setRealtimeEvents([]);
                }}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh to see all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle>Activity Feed</CardTitle>
              <Badge variant="secondary">{pagination?.total || 0} events</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={showFilters ? 'secondary' : 'outline'} 
                    size="icon"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showFilters ? 'Hide filters' : 'Show filters'}</TooltipContent>
              </Tooltip>
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Export</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-40" align="end">
                  <div className="space-y-2">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => handleExport('json')}
                    >
                      Export JSON
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => handleExport('csv')}
                    >
                      Export CSV
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Severity Filter */}
              <div>
                <Label className="mb-2 block">Severity</Label>
                <div className="space-y-2">
                  {['info', 'warning', 'error'].map((sev) => (
                    <div key={sev} className="flex items-center gap-2">
                      <Checkbox
                        id={`sev-${sev}`}
                        checked={selectedSeverities.includes(sev)}
                        onCheckedChange={(checked) => {
                          setSelectedSeverities(prev =>
                            checked ? [...prev, sev] : prev.filter(s => s !== sev)
                          );
                        }}
                      />
                      <Label htmlFor={`sev-${sev}`} className="capitalize">{sev}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <Label className="mb-2 block">Event Types</Label>
                <Select
                  value={selectedTypes[0] || 'all'}
                  onValueChange={(value) => setSelectedTypes(value && value !== 'all' ? [value] : [])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {Object.entries(groupedTypes).map(([category, types]) => (
                      types.map((type: any) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div>
                <Label className="mb-2 block">Date Range</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.start ? dateRange.start.toLocaleDateString() : 'Start date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.start}
                        onSelect={(date) => setDateRange(prev => ({ ...prev, start: date }))}
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.end ? dateRange.end.toLocaleDateString() : 'End date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.end}
                        onSelect={(date) => setDateRange(prev => ({ ...prev, end: date }))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {/* Events List */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No events found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event: any) => (
                <div 
                  key={event.id}
                  className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className={cn(
                    'p-2 rounded-full',
                    severityColors[event.severity]
                  )}>
                    {severityIcons[event.severity]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {event.type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm">{event.message}</p>
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {Object.entries(event.metadata).slice(0, 3).map(([key, value]) => (
                          <span key={key} className="mr-3">
                            <span className="font-medium">{key}:</span>{' '}
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPrev}
                  onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNext}
                  onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}





