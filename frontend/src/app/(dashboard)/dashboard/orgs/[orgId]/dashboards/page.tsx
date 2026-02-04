'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { dashboardsApi } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Plus,
  Trash2,
  Copy,
  Edit,
  Eye,
  Lock,
  Users,
  Globe,
  BarChart3,
  LineChart,
  PieChart,
  Activity,
  Loader2,
} from 'lucide-react';

const visibilityConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  private: { label: 'Private', icon: <Lock className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
  org: { label: 'Organization', icon: <Users className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
  public: { label: 'Public', icon: <Globe className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
};

export default function DashboardsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const orgId = params.orgId as string;

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteDashboard, setDeleteDashboard] = useState<{ id: string; name: string } | null>(null);
  const [duplicateDashboard, setDuplicateDashboard] = useState<{ id: string; name: string } | null>(null);
  const [duplicateName, setDuplicateName] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');

  const { data: dashboards, isLoading } = useQuery({
    queryKey: ['dashboards', orgId],
    queryFn: async () => {
      const res = await dashboardsApi.list(orgId);
      return res.success ? res.data : [];
    },
    enabled: !!orgId,
  });

  const { data: templates } = useQuery({
    queryKey: ['dashboard-templates', orgId],
    queryFn: async () => {
      const res = await dashboardsApi.getTemplates(orgId);
      return res.success ? res.data : [];
    },
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; templateId?: string }) => {
      if (data.templateId) {
        return dashboardsApi.createFromTemplate(orgId, data.templateId);
      }
      return dashboardsApi.create(orgId, { name: data.name, description: data.description });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', orgId] });
      toast({ title: 'Dashboard created' });
      setShowCreateDialog(false);
      resetForm();
      if (res.data?.id) {
        router.push(`/dashboard/orgs/${orgId}/dashboards/${res.data.id}`);
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (dashboardId: string) => dashboardsApi.delete(orgId, dashboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', orgId] });
      toast({ title: 'Dashboard deleted' });
      setDeleteDashboard(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ dashboardId, newName }: { dashboardId: string; newName: string }) =>
      dashboardsApi.duplicate(orgId, dashboardId, newName),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', orgId] });
      toast({ title: 'Dashboard duplicated' });
      setDuplicateDashboard(null);
      setDuplicateName('');
      if (res.data?.id) {
        router.push(`/dashboard/orgs/${orgId}/dashboards/${res.data.id}`);
      }
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setSelectedTemplate('blank');
  };

  const handleCreate = () => {
    if (selectedTemplate && selectedTemplate !== 'blank') {
      createMutation.mutate({ name: '', templateId: selectedTemplate });
    } else if (name) {
      createMutation.mutate({ name, description });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboards"
        description="Create custom dashboards to monitor your clusters"
      />

      <div className="flex justify-end">
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Dashboard
        </Button>
      </div>

      {!dashboards || dashboards.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard className="h-12 w-12" />}
          title="No dashboards yet"
          description="Create a custom dashboard to visualize your cluster metrics"
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Dashboard
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((dashboard: any) => {
            const visibility = visibilityConfig[dashboard.visibility] || visibilityConfig.private;
            return (
              <Card key={dashboard.id} className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <LayoutDashboard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{dashboard.name}</CardTitle>
                        <Badge className={visibility.color} variant="secondary">
                          {visibility.icon}
                          <span className="ml-1">{visibility.label}</span>
                        </Badge>
                      </div>
                    </div>
                    {dashboard.isDefault && (
                      <Badge variant="outline">Default</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  {dashboard.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {dashboard.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Activity className="h-4 w-4" />
                      {dashboard.widgets?.length || 0} widgets
                    </span>
                    <span>{formatDate(dashboard.updatedAt || dashboard.createdAt)}</span>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/dashboard/orgs/${orgId}/dashboards/${dashboard.id}`)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDuplicateDashboard({ id: dashboard.id, name: dashboard.name });
                            setDuplicateName(`${dashboard.name} (Copy)`);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Duplicate</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteDashboard({ id: dashboard.id, name: dashboard.name })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Dashboard</DialogTitle>
            <DialogDescription>
              Create a new dashboard or start from a template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Start from Template (optional)</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank Dashboard</SelectItem>
                  {templates?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} - {t.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(!selectedTemplate || selectedTemplate === 'blank') && (
              <>
                <div className="space-y-2">
                  <Label>Dashboard Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Dashboard"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Dashboard description..."
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || ((!selectedTemplate || selectedTemplate === 'blank') && !name)}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={!!duplicateDashboard} onOpenChange={() => setDuplicateDashboard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Dashboard</DialogTitle>
            <DialogDescription>
              Create a copy of "{duplicateDashboard?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Dashboard Name</Label>
              <Input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDuplicateDashboard(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => duplicateDashboard && duplicateMutation.mutate({
                  dashboardId: duplicateDashboard.id,
                  newName: duplicateName,
                })}
                disabled={duplicateMutation.isPending || !duplicateName}
              >
                {duplicateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Duplicate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteDashboard}
        onOpenChange={() => setDeleteDashboard(null)}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${deleteDashboard?.name}"? This action cannot be undone.`}
        onConfirm={() => deleteDashboard && deleteMutation.mutate(deleteDashboard.id)}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}





