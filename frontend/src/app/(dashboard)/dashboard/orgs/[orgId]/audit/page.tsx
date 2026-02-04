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
import { auditApi } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Search,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  User,
  Key,
  Settings,
  Shield,
  Clock,
  FileText,
} from 'lucide-react';

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

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [resourceFilter, setResourceFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', orgId, search, actionFilter, resourceFilter, page],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit: 25 };
      if (search) params.search = search;
      if (actionFilter) params.actions = actionFilter;
      if (resourceFilter) params.resourceTypes = resourceFilter;
      const res = await auditApi.query(orgId, params);
      return res.success ? res : null;
    },
    enabled: !!orgId,
  });

  const { data: stats } = useQuery({
    queryKey: ['audit-stats', orgId],
    queryFn: async () => {
      const res = await auditApi.getStats(orgId);
      return res.success ? res.data : null;
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

  const handleExport = (format: 'json' | 'csv') => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    window.open(auditApi.exportUrl(orgId, startDate, endDate, format), '_blank');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Track all actions and changes in your organization"
        action={
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
              <div className="text-2xl font-bold text-green-600">{stats.byAction?.CREATE ?? 0}</div>
              <p className="text-sm text-muted-foreground">Creates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{stats.byAction?.UPDATE ?? 0}</div>
              <p className="text-sm text-muted-foreground">Updates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.byAction?.DELETE ?? 0}</div>
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
                <SelectItem value="">All Actions</SelectItem>
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
                <SelectItem value="">All Resources</SelectItem>
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
          {logs.data.map((log: any) => (
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





