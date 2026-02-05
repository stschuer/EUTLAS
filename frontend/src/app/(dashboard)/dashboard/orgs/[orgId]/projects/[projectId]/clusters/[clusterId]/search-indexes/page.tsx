'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { SearchIndexList } from '@/components/search-indexes/search-index-list';
import { CreateSearchIndexForm } from '@/components/search-indexes/create-search-index-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTestSearchIndex } from '@/hooks/use-search-indexes';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import Link from 'next/link';

export default function SearchIndexesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const clusterName = searchParams.get('clusterName') || 'Cluster';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [testDialog, setTestDialog] = useState<{ indexId: string } | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any>(null);

  const testMutation = useTestSearchIndex();

  const handleTest = async () => {
    if (!testDialog || !testQuery.trim()) return;

    try {
      const result = await testMutation.mutateAsync({
        projectId,
        clusterId,
        indexId: testDialog.indexId,
        data: { query: testQuery, limit: 10 },
      });
      setTestResults(result);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/clusters/${clusterId}?projectId=${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Search Indexes"
          description={`Manage Atlas Search and Vector Search indexes for ${clusterName}`}
        />
      </div>

      {showCreateForm ? (
        <CreateSearchIndexForm
          projectId={projectId}
          clusterId={clusterId}
          onSuccess={() => setShowCreateForm(false)}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : (
        <SearchIndexList
          projectId={projectId}
          clusterId={clusterId}
          onCreateClick={() => setShowCreateForm(true)}
          onTestClick={(indexId) => {
            setTestDialog({ indexId });
            setTestQuery('');
            setTestResults(null);
          }}
        />
      )}

      {/* Test Dialog */}
      <Dialog open={!!testDialog} onOpenChange={() => setTestDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Test Search Index</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search Query</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter your search query..."
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTest();
                  }}
                />
                <Button onClick={handleTest} disabled={testMutation.isPending || !testQuery.trim()}>
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {testResults && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {testResults.results.length} results
                  </span>
                  <span className="text-muted-foreground">
                    {testResults.executionTime}ms
                  </span>
                </div>
                <div className="max-h-[400px] overflow-auto border rounded-lg">
                  {testResults.results.map((result: any, i: number) => (
                    <div
                      key={result._id}
                      className="p-3 border-b last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {result.document.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Score: {result.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {result.document.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}





