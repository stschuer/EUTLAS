'use client';

import { useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Gauge,
  Clock,
  Database,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  ArrowLeft,
  Play,
  Lightbulb,
  Key,
  FileJson,
  ChevronRight,
  BarChart3,
} from 'lucide-react';

interface SlowQuery {
  id: string;
  database: string;
  collection: string;
  operation: string;
  query: any;
  executionTimeMs: number;
  docsExamined: number;
  docsReturned: number;
  collectionScan: boolean;
  indexUsed?: string;
  timestamp: string;
}

interface IndexSuggestion {
  id: string;
  database: string;
  collection: string;
  suggestedIndex: Record<string, number>;
  suggestedIndexName?: string;
  impact: 'high' | 'medium' | 'low';
  reason: string;
  avgExecutionTimeMs: number;
  queryCount: number;
  estimatedImprovementPercent: number;
  status: 'pending' | 'applied' | 'dismissed';
  sampleQueries: string[];
}

interface PerformanceStats {
  totalSlowQueries: number;
  avgExecutionTime: number;
  topCollections: { collection: string; count: number; avgTime: number }[];
  collectionScans: number;
  pendingSuggestions: number;
}

interface QueryAnalysis {
  isOptimal: boolean;
  usesIndex: boolean;
  indexUsed?: string;
  collectionScan: boolean;
  docsExamined: number;
  docsReturned: number;
  efficiency: number;
  suggestions: string[];
  suggestedIndex?: Record<string, number>;
  estimatedImprovement?: number;
}

const impactColors: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const impactLabels: Record<string, string> = {
  high: 'High Impact',
  medium: 'Medium Impact',
  low: 'Low Impact',
};

export default function PerformanceAdvisorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const baseUrl = `/projects/${projectId}/clusters/${clusterId}/performance`;

  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false);
  const [analyzeDatabase, setAnalyzeDatabase] = useState('');
  const [analyzeCollection, setAnalyzeCollection] = useState('');
  const [analyzeQuery, setAnalyzeQuery] = useState('{}');
  const [analyzeSort, setAnalyzeSort] = useState('{}');
  const [analysisResult, setAnalysisResult] = useState<QueryAnalysis | null>(null);
  
  const [dismissSuggestionId, setDismissSuggestionId] = useState<string | null>(null);
  const [applySuggestionId, setApplySuggestionId] = useState<string | null>(null);

  // Fetch performance stats
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['performance-stats', clusterId],
    queryFn: async () => {
      const res = await apiClient.get(`${baseUrl}/stats?days=7`);
      return res.data.data as PerformanceStats;
    },
    enabled: !!projectId,
    refetchInterval: 60000,
  });

  // Fetch slow queries
  const { data: slowQueries, isLoading: loadingQueries } = useQuery({
    queryKey: ['slow-queries', clusterId],
    queryFn: async () => {
      const res = await apiClient.get(`${baseUrl}/slow-queries?limit=50`);
      return res.data.data as SlowQuery[];
    },
    enabled: !!projectId,
  });

  // Fetch index suggestions
  const { data: suggestions, isLoading: loadingSuggestions } = useQuery({
    queryKey: ['index-suggestions', clusterId],
    queryFn: async () => {
      const res = await apiClient.get(`${baseUrl}/suggestions?status=pending`);
      return res.data.data as IndexSuggestion[];
    },
    enabled: !!projectId,
  });

  // Analyze query mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      let query = {};
      let sort = undefined;
      try { query = JSON.parse(analyzeQuery); } catch { throw new Error('Invalid query JSON'); }
      try { if (analyzeSort && analyzeSort !== '{}') sort = JSON.parse(analyzeSort); } catch {}
      
      const res = await apiClient.post(`${baseUrl}/analyze`, {
        database: analyzeDatabase,
        collection: analyzeCollection,
        query,
        sort,
      });
      return res.data.data as QueryAnalysis;
    },
    onSuccess: (result) => {
      setAnalysisResult(result);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to analyze query', variant: 'destructive' });
    },
  });

  // Apply suggestion mutation
  const applyMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      await apiClient.post(`${baseUrl}/suggestions/${suggestionId}/apply`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['index-suggestions', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['performance-stats', clusterId] });
      setApplySuggestionId(null);
      toast({ title: 'Index created successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to apply suggestion', variant: 'destructive' });
    },
  });

  // Dismiss suggestion mutation
  const dismissMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      await apiClient.post(`${baseUrl}/suggestions/${suggestionId}/dismiss`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['index-suggestions', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['performance-stats', clusterId] });
      setDismissSuggestionId(null);
      toast({ title: 'Suggestion dismissed' });
    },
  });

  if (!projectId) {
    return (
      <EmptyState
        icon={<Gauge className="h-12 w-12" />}
        title="Missing Project ID"
        description="Please navigate to this page from the cluster detail page."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Advisor"
        description="Analyze queries and get index recommendations"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAnalyzeDialog(true)}>
              <Search className="h-4 w-4 mr-2" /> Analyze Query
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </div>
        }
      />

      {/* Stats Overview */}
      {loadingStats ? (
        <div className="flex justify-center p-8"><LoadingSpinner /></div>
      ) : stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalSlowQueries}</div>
                  <div className="text-sm text-muted-foreground">Slow Queries (7d)</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.avgExecutionTime}ms</div>
                  <div className="text-sm text-muted-foreground">Avg Time</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={stats.collectionScans > 0 ? 'border-red-500/50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${stats.collectionScans > 0 ? 'text-red-500' : 'text-green-500'}`} />
                <div>
                  <div className="text-2xl font-bold">{stats.collectionScans}</div>
                  <div className="text-sm text-muted-foreground">Collection Scans</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={stats.pendingSuggestions > 0 ? 'border-yellow-500/50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Lightbulb className={`h-5 w-5 ${stats.pendingSuggestions > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-2xl font-bold">{stats.pendingSuggestions}</div>
                  <div className="text-sm text-muted-foreground">Suggestions</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.topCollections.length}</div>
                  <div className="text-sm text-muted-foreground">Hot Collections</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="suggestions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suggestions">
            Index Suggestions
            {suggestions && suggestions.length > 0 && (
              <Badge variant="secondary" className="ml-2">{suggestions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="slow-queries">Slow Queries</TabsTrigger>
          <TabsTrigger value="top-collections">Top Collections</TabsTrigger>
        </TabsList>

        {/* Index Suggestions */}
        <TabsContent value="suggestions" className="space-y-4">
          {loadingSuggestions ? (
            <div className="flex justify-center p-8"><LoadingSpinner /></div>
          ) : suggestions && suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <Card key={suggestion.id} className="border-l-4" style={{ borderLeftColor: suggestion.impact === 'high' ? '#ef4444' : suggestion.impact === 'medium' ? '#f59e0b' : '#3b82f6' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {suggestion.database}.{suggestion.collection}
                      </CardTitle>
                      <CardDescription>{suggestion.reason}</CardDescription>
                    </div>
                    <Badge className={impactColors[suggestion.impact]}>
                      {impactLabels[suggestion.impact]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 rounded p-3">
                    <div className="text-sm text-muted-foreground mb-1">Suggested Index</div>
                    <code className="text-sm font-mono">
                      {JSON.stringify(suggestion.suggestedIndex)}
                    </code>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Affected Queries:</span>
                      <span className="ml-2 font-medium">{suggestion.queryCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Time:</span>
                      <span className="ml-2 font-medium">{suggestion.avgExecutionTimeMs}ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Est. Improvement:</span>
                      <span className="ml-2 font-medium text-green-600">~{suggestion.estimatedImprovementPercent}%</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDismissSuggestionId(suggestion.id)}>
                      <XCircle className="h-4 w-4 mr-1" /> Dismiss
                    </Button>
                    <Button size="sm" onClick={() => setApplySuggestionId(suggestion.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Apply Index
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
              title="No pending suggestions"
              description="Your indexes look good! We'll notify you when we find optimization opportunities."
            />
          )}
        </TabsContent>

        {/* Slow Queries */}
        <TabsContent value="slow-queries" className="space-y-4">
          {loadingQueries ? (
            <div className="flex justify-center p-8"><LoadingSpinner /></div>
          ) : slowQueries && slowQueries.length > 0 ? (
            <div className="space-y-2">
              {slowQueries.map((query) => (
                <Card key={query.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{query.operation}</Badge>
                          <span className="text-sm font-medium">{query.database}.{query.collection}</span>
                          {query.collectionScan && (
                            <Badge variant="destructive" className="text-xs">COLLSCAN</Badge>
                          )}
                        </div>
                        <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(query.query, null, 2).slice(0, 200)}
                          {JSON.stringify(query.query).length > 200 && '...'}
                        </pre>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-bold text-orange-500">{query.executionTimeMs}ms</div>
                        <div className="text-xs text-muted-foreground">
                          {query.docsExamined} examined / {query.docsReturned} returned
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(query.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Zap className="h-12 w-12 text-green-500" />}
              title="No slow queries"
              description="Great job! Your queries are performing well."
            />
          )}
        </TabsContent>

        {/* Top Collections */}
        <TabsContent value="top-collections" className="space-y-4">
          {stats && stats.topCollections.length > 0 ? (
            <div className="space-y-2">
              {stats.topCollections.map((coll, i) => (
                <Card key={coll.collection}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                          {i + 1}
                        </div>
                        <div>
                          <div className="font-medium">{coll.collection}</div>
                          <div className="text-sm text-muted-foreground">{coll.count} slow queries</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{coll.avgTime}ms</div>
                        <div className="text-xs text-muted-foreground">avg time</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Database className="h-12 w-12" />}
              title="No data yet"
              description="Collection performance stats will appear here as queries are executed."
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Analyze Query Dialog */}
      <Dialog open={showAnalyzeDialog} onOpenChange={setShowAnalyzeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Analyze Query</DialogTitle>
            <DialogDescription>
              Test a query and get performance insights and index recommendations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Database</Label>
                <Input
                  value={analyzeDatabase}
                  onChange={(e) => setAnalyzeDatabase(e.target.value)}
                  placeholder="myDatabase"
                />
              </div>
              <div className="space-y-2">
                <Label>Collection</Label>
                <Input
                  value={analyzeCollection}
                  onChange={(e) => setAnalyzeCollection(e.target.value)}
                  placeholder="myCollection"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Query Filter (JSON)</Label>
              <Textarea
                value={analyzeQuery}
                onChange={(e) => setAnalyzeQuery(e.target.value)}
                placeholder='{"status": "active", "createdAt": {"$gte": "2024-01-01"}}'
                className="font-mono text-sm min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Sort (optional, JSON)</Label>
              <Input
                value={analyzeSort}
                onChange={(e) => setAnalyzeSort(e.target.value)}
                placeholder='{"createdAt": -1}'
                className="font-mono text-sm"
              />
            </div>
            
            <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending || !analyzeDatabase || !analyzeCollection}>
              {analyzeMutation.isPending ? <LoadingSpinner className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Analyze
            </Button>

            {analysisResult && (
              <Card className={analysisResult.isOptimal ? 'border-green-500/50 bg-green-500/5' : 'border-yellow-500/50 bg-yellow-500/5'}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {analysisResult.isOptimal ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    <span className="font-medium">
                      {analysisResult.isOptimal ? 'Query is well optimized' : 'Query could be improved'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Uses Index:</span>
                      <span className="ml-2">{analysisResult.usesIndex ? '✓ Yes' : '✗ No'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Docs Examined:</span>
                      <span className="ml-2">{analysisResult.docsExamined}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Docs Returned:</span>
                      <span className="ml-2">{analysisResult.docsReturned}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Efficiency:</span>
                      <span className="ml-2">{(analysisResult.efficiency * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {analysisResult.suggestions.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Recommendations:</div>
                      <ul className="text-sm list-disc list-inside text-muted-foreground">
                        {analysisResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {analysisResult.suggestedIndex && (
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-sm font-medium mb-1">Suggested Index:</div>
                      <code className="text-xs">{JSON.stringify(analysisResult.suggestedIndex)}</code>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply Confirmation */}
      <ConfirmDialog
        open={!!applySuggestionId}
        onClose={() => setApplySuggestionId(null)}
        onConfirm={() => applySuggestionId && applyMutation.mutate(applySuggestionId)}
        title="Apply Index Suggestion"
        description="This will create the suggested index on your cluster. Index creation may temporarily impact performance."
        confirmText="Create Index"
        isLoading={applyMutation.isPending}
      />

      {/* Dismiss Confirmation */}
      <ConfirmDialog
        open={!!dismissSuggestionId}
        onClose={() => setDismissSuggestionId(null)}
        onConfirm={() => dismissSuggestionId && dismissMutation.mutate(dismissSuggestionId)}
        title="Dismiss Suggestion"
        description="Are you sure you want to dismiss this suggestion? It won't appear again unless re-triggered."
        confirmText="Dismiss"
        isDestructive
        isLoading={dismissMutation.isPending}
      />
    </div>
  );
}




