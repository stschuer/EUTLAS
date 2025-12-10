'use client';

import { useState } from 'react';
import { useScalingRecommendations, useScalingHistory, useAnalyzeCluster, useApplyRecommendation, useDismissRecommendation } from '@/hooks/use-scaling';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Zap,
  DollarSign,
  Cpu,
  MemoryStick,
  Loader2,
  History,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ScalingRecommendationsProps {
  projectId: string;
  clusterId: string;
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800',
};

const typeIcons: Record<string, React.ReactNode> = {
  scale_up: <TrendingUp className="h-5 w-5 text-yellow-600" />,
  scale_down: <TrendingDown className="h-5 w-5 text-green-600" />,
  optimize: <Zap className="h-5 w-5 text-blue-600" />,
};

export function ScalingRecommendations({ projectId, clusterId }: ScalingRecommendationsProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [dismissDialog, setDismissDialog] = useState<{ id: string; title: string } | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [applyDialog, setApplyDialog] = useState<{ id: string; title: string; plan: string } | null>(null);
  const { toast } = useToast();

  const { data: recommendations, isLoading } = useScalingRecommendations(projectId, clusterId);
  const { data: history } = useScalingHistory(projectId, clusterId);
  const analyzeMutation = useAnalyzeCluster();
  const applyMutation = useApplyRecommendation();
  const dismissMutation = useDismissRecommendation();

  const handleAnalyze = async () => {
    try {
      const result = await analyzeMutation.mutateAsync({ projectId, clusterId });
      toast({
        title: 'Analysis Complete',
        description: result.message || 'Cluster analyzed successfully',
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleApply = async () => {
    if (!applyDialog) return;
    try {
      await applyMutation.mutateAsync({
        projectId,
        clusterId,
        recommendationId: applyDialog.id,
      });
      toast({ title: 'Scaling initiated', description: `Cluster resize to ${applyDialog.plan} started` });
      setApplyDialog(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDismiss = async () => {
    if (!dismissDialog) return;
    try {
      await dismissMutation.mutateAsync({
        projectId,
        clusterId,
        recommendationId: dismissDialog.id,
        reason: dismissReason || undefined,
      });
      toast({ title: 'Recommendation dismissed' });
      setDismissDialog(null);
      setDismissReason('');
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
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleAnalyze} disabled={analyzeMutation.isPending}>
            {analyzeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Analyze Now
          </Button>
          <Button variant="ghost" onClick={() => setShowHistory(!showHistory)}>
            <History className="h-4 w-4 mr-2" />
            {showHistory ? 'Hide History' : 'Show History'}
          </Button>
        </div>
      </div>

      {/* Active Recommendations */}
      {!recommendations || recommendations.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="h-12 w-12 text-green-500" />}
          title="No recommendations"
          description="Your cluster is optimally sized. We'll notify you if we detect opportunities to scale."
        />
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec: any) => (
            <Card key={rec.id} className={`border-l-4 ${rec.type === 'scale_down' ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {typeIcons[rec.type]}
                    <div>
                      <CardTitle className="text-lg">{rec.title}</CardTitle>
                      <CardDescription>{rec.description}</CardDescription>
                    </div>
                  </div>
                  <Badge className={priorityColors[rec.priority]}>
                    {rec.priority}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                {/* Plan Change */}
                {rec.currentPlan && rec.recommendedPlan && (
                  <div className="flex items-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">Current</div>
                      <div className="font-bold text-lg">{rec.currentPlan}</div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">Recommended</div>
                      <div className="font-bold text-lg text-primary">{rec.recommendedPlan}</div>
                    </div>
                    {rec.estimatedMonthlySavings && (
                      <div className="ml-auto text-center">
                        <div className="text-sm text-muted-foreground">Monthly Savings</div>
                        <div className="font-bold text-lg text-green-600">€{rec.estimatedMonthlySavings}</div>
                      </div>
                    )}
                    {rec.estimatedMonthlyCost && (
                      <div className="ml-auto text-center">
                        <div className="text-sm text-muted-foreground">Additional Cost</div>
                        <div className="font-bold text-lg text-yellow-600">+€{rec.estimatedMonthlyCost}/mo</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Metrics */}
                {rec.metrics && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    {rec.metrics.avgCpuPercent !== undefined && (
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm text-muted-foreground">Avg CPU</div>
                          <div className="font-medium">{rec.metrics.avgCpuPercent.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                    {rec.metrics.maxCpuPercent !== undefined && (
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm text-muted-foreground">Peak CPU</div>
                          <div className="font-medium">{rec.metrics.maxCpuPercent.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                    {rec.metrics.avgMemoryPercent !== undefined && (
                      <div className="flex items-center gap-2">
                        <MemoryStick className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm text-muted-foreground">Avg Memory</div>
                          <div className="font-medium">{rec.metrics.avgMemoryPercent.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                    {rec.metrics.maxMemoryPercent !== undefined && (
                      <div className="flex items-center gap-2">
                        <MemoryStick className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm text-muted-foreground">Peak Memory</div>
                          <div className="font-medium">{rec.metrics.maxMemoryPercent.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Insights */}
                {rec.insights && rec.insights.length > 0 && (
                  <div className="space-y-1">
                    {rec.insights.map((insight: string, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        {insight}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-end gap-2 pt-0">
                <Button
                  variant="ghost"
                  onClick={() => setDismissDialog({ id: rec.id, title: rec.title })}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
                <Button
                  onClick={() => setApplyDialog({ id: rec.id, title: rec.title, plan: rec.recommendedPlan })}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Apply
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* History */}
      {showHistory && history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendation History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((rec: any) => (
                <div key={rec.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    {typeIcons[rec.type]}
                    <div>
                      <div className="font-medium">{rec.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {rec.currentPlan} → {rec.recommendedPlan}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={rec.status === 'applied' ? 'default' : rec.status === 'dismissed' ? 'secondary' : 'outline'}>
                      {rec.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDate(rec.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Apply Dialog */}
      <ConfirmDialog
        open={!!applyDialog}
        onOpenChange={() => setApplyDialog(null)}
        title="Apply Scaling Recommendation"
        description={`This will resize your cluster to ${applyDialog?.plan}. The cluster may be briefly unavailable during the resize.`}
        onConfirm={handleApply}
        confirmText="Apply & Resize"
        loading={applyMutation.isPending}
      />

      {/* Dismiss Dialog */}
      <Dialog open={!!dismissDialog} onOpenChange={() => setDismissDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Recommendation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to dismiss "{dismissDialog?.title}"? You can optionally provide a reason.
            </p>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g., Expected growth next month"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissDialog(null)}>Cancel</Button>
            <Button onClick={handleDismiss} disabled={dismissMutation.isPending}>
              {dismissMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


