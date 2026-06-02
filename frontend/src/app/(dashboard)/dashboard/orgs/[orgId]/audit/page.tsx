'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { auditApi, apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  User,
  Key,
  Settings,
  Shield,
  Clock,
  FileText,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type AuditLogEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceName?: string;
  description?: string;
  actorType?: string;
  actorEmail?: string;
  ipAddress?: string;
  timestamp: string;
};

type AuditLogsResult = {
  data: AuditLogEntry[];
  page: number;
  totalPages: number;
  total: number;
};

type AuditStats = {
  totalEvents: number;
  byAction: Record<string, number>;
};

function sumActions(byAction: Record<string, number> | undefined, keys: string[]): number {
  return keys.reduce((sum, key) => sum + (byAction?.[key] ?? 0), 0);
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
  LOGIN_FAILED: 'bg-red-100 text-red-800',
  SETTINGS_CHANGED: 'bg-yellow-100 text-yellow-800',
};

export default function AuditLogsPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', orgId, search, actionFilter, resourceFilter, page],
    queryFn: async (): Promise<AuditLogsResult> => {
      const queryParams: Record<string, string | number> = { page, limit: 25 };
      if (search) queryParams.search = search;
      if (actionFilter && actionFilter !== 'all') queryParams.actions = actionFilter;
      if (resourceFilter && resourceFilter !== 'all') queryParams.resourceTypes = resourceFilter;

      const res = await auditApi.query(orgId, queryParams);
      if (!res.success) {
        return { data: [], page: 1, totalPages: 1, total: 0 };
      }

      const payload = res as AuditLogsResult & { success: boolean };
      return {
        data: Array.isArray(payload.data) ? payload.data : [],
        page: payload.page ?? 1,
        totalPages: payload.totalPages ?? 1,
        total: payload.total ?? 0,
      };
    },
    enabled: !!orgId,
  });

  const { data: stats } = useQuery({
    queryKey: ['audit-stats', orgId],
    queryFn: async (): Promise<AuditStats> => {
      const res = await auditApi.getStats(orgId);
      if (!res.success || !res.data) {
        return { totalEvents: 0, byAction: {} };
      }
      return res.data as AuditStats;
    },
    enabled: !!orgId,
  });

  const { data: actions } = useQuery({
    queryKey: ['audit-actions', orgId],
    queryFn: async () => {
      const res = await auditApi.getActions(orgId);
      return res.success ? res.data : [];
    },
    enabled: !!orgId,
    staleTime: Infinity,
  });

  const { data: resourceTypes } = useQuery({
    queryKey: ['audit-resource-types', orgId],
    queryFn: async () => {
      const res = await auditApi.getResourceTypes(orgId);
      return res.success ? res.data : [];
    },
    enabled: !!orgId,
    staleTime: Infinity,
  });

  const handleExport = async (format: 'json' | 'csv') => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const token = apiClient.getToken();

    try {
      const response = await fetch(auditApi.exportUrl(orgId, startDate, endDate, format), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${startDate}-${endDate}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not download audit logs. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const createCount = sumActions(stats?.byAction, [
    'CREATE', 'CLUSTER_CREATED', 'API_KEY_CREATED', 'BACKUP_CREATED',
  ]);
  const updateCount = sumActions(stats?.byAction, [
    'UPDATE', 'CLUSTER_RESIZED', 'SETTINGS_CHANGED', 'ROLE_CHANGED',
  ]);
  const deleteCount = sumActions(stats?.byAction, [
    'DELETE', 'CLUSTER_DELETED', 'API_KEY_DELETED', 'BACKUP_DELETED',
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Track all actions and changes in your organization"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport('csv')}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport('json')}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
          </div>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{(stats.totalEvents ?? 0).toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Total Events (30d)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{createCount}</div>
              <p className="text-sm text-muted-foreground">Creates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{updateCount}</div>
              <p className="text-sm text-muted-foreground">Updates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{deleteCount}</div>
              <p className="text-sm text-muted-foreground">Deletes</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {(actions || []).map((action: string) => (
                  <SelectItem key={action} value={action}>{action}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {(resourceTypes || []).map((type: string) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !logs?.data || logs.data.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No audit logs yet"
          description="Actions in your organization will be recorded here for security and compliance."
        />
      ) : (
        <div className="space-y-2">
          {logs.data.map((log: AuditLogEntry) => (
            <Card key={log.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      {log.actorType === 'user' && <User className="h-5 w-5" />}
                      {log.actorType === 'api_key' && <Key className="h-5 w-5" />}
                      {log.actorType === 'system' && <Settings className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={actionColors[log.action] || 'bg-gray-100 text-gray-800'}>
                          {log.action}
                        </Badge>
                        <Badge variant="outline">{log.resourceType}</Badge>
                        {log.resourceName && (
                          <span className="text-sm font-medium">{log.resourceName}</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {log.description || `${log.action} on ${log.resourceType}`}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {log.actorEmail || 'System'}
                        </span>
                        {log.ipAddress && (
                          <span className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {log.ipAddress}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(log.timestamp)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {logs && (logs.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                Page {logs.page ?? 1} of {logs.totalPages ?? 1} ({logs.total ?? 0} total)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(logs.totalPages ?? 1, p + 1))}
                  disabled={page >= (logs.totalPages ?? 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}





