'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { projectsApi, clustersApi, privateNetworksApi } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  Server,
  Plus,
  Network,
  Shield,
  Activity,
  Settings,
  ChevronRight,
  ArrowLeft,
  Database,
  Clock,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Pause,
  BookOpen,
} from 'lucide-react';

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  creating: { color: 'bg-blue-100 text-blue-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  running: { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  paused: { color: 'bg-yellow-100 text-yellow-800', icon: <Pause className="h-3 w-3" /> },
  failed: { color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-3 w-3" /> },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', orgId, projectId],
    queryFn: async () => {
      const res = await projectsApi.get(orgId, projectId);
      return res.success ? res.data : null;
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: clusters, isLoading: loadingClusters } = useQuery({
    queryKey: ['clusters', projectId],
    queryFn: async () => {
      const res = await clustersApi.list(projectId);
      return res.success ? res.data : [];
    },
    enabled: !!projectId,
  });

  const { data: networks } = useQuery({
    queryKey: ['private-networks', projectId],
    queryFn: async () => {
      const res = await privateNetworksApi.list(projectId);
      return res.success ? res.data : [];
    },
    enabled: !!projectId,
  });

  if (loadingProject) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        icon={<Database className="h-12 w-12" />}
        title="Project not found"
        description="The requested project could not be found."
        action={
          <Button onClick={() => router.push(`/dashboard/orgs/${orgId}`)}>
            Back to Organization
          </Button>
        }
      />
    );
  }

  const quickActions = [
    {
      title: 'Private Networks',
      description: 'Configure VPC networks for secure connectivity',
      icon: <Network className="h-5 w-5" />,
      href: `/dashboard/orgs/${orgId}/projects/${projectId}/networks`,
      count: networks?.length || 0,
    },
    {
      title: 'Access Control',
      description: 'Manage IP whitelist and security settings',
      icon: <Shield className="h-5 w-5" />,
      href: `/dashboard/orgs/${orgId}/api-keys`,
    },
    {
      title: 'Activity',
      description: 'View recent events and audit logs',
      icon: <Activity className="h-5 w-5" />,
      href: `/dashboard/orgs/${orgId}/activity`,
    },
    {
      title: 'API Docs',
      description: 'LLM-ready API reference with your project IDs',
      icon: <BookOpen className="h-5 w-5" />,
      href: `/dashboard/orgs/${orgId}/projects/${projectId}/api-docs`,
    },
    {
      title: 'Settings',
      description: 'Project configuration and preferences',
      icon: <Settings className="h-5 w-5" />,
      href: '#',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/orgs/${orgId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Organization
        </Button>
      </div>

      <PageHeader
        title={project.name}
        description={project.description || `Project in organization`}
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Link key={action.title} href={action.href}>
            <Card className="h-full hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-primary/10">
                    {action.icon}
                  </div>
                  {action.count !== undefined && action.count > 0 && (
                    <Badge variant="secondary">{action.count}</Badge>
                  )}
                </div>
                <h3 className="font-medium mt-3">{action.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Clusters */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Clusters</CardTitle>
            <CardDescription>MongoDB clusters in this project</CardDescription>
          </div>
          <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Cluster
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loadingClusters ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : clusters && clusters.length > 0 ? (
            <div className="space-y-3">
              {clusters.filter((c: any) => c && c.id).map((cluster: any) => {
                const status = statusConfig[cluster.status] || statusConfig.creating;
                return (
                  <Link
                    key={cluster.id}
                    href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${cluster.id}`}
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Server className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{cluster.name || 'Unknown'}</span>
                            <Badge className={status.color}>
                              {status.icon}
                              <span className="ml-1 capitalize">{cluster.status || 'unknown'}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>{cluster.plan || 'N/A'}</span>
                            <span>•</span>
                            <span>v{cluster.mongoVersion || 'N/A'}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(cluster.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Server className="h-10 w-10" />}
              title="No clusters yet"
              description="Create a cluster to start using MongoDB"
              action={
                <Link href={`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/new`}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Cluster
                  </Button>
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Project Info */}
      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Project ID</dt>
              <dd className="font-mono">{project.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Slug</dt>
              <dd>{project.slug}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(project.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Clusters</dt>
              <dd>{clusters?.length || 0}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}





