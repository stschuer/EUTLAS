'use client';

import { useState, useEffect } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Database,
  Table,
  FileJson,
  Plus,
  Trash2,
  RefreshCw,
  ChevronRight,
  Search,
  Play,
  Key,
  Clock,
  ArrowLeft,
  Edit,
  Eye,
  Copy,
  BarChart3,
} from 'lucide-react';
import { QueryResultChart } from '@/components/charts/query-result-chart';

interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
  collections: number;
}

interface CollectionInfo {
  name: string;
  type: string;
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexes: number;
}

interface IndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  size: number;
}

interface QueryResult {
  documents: any[];
  totalCount: number;
  executionTime: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function DataExplorerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';

  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [view, setView] = useState<'browse' | 'indexes' | 'query'>('browse');
  
  const [queryFilter, setQueryFilter] = useState('{}');
  const [querySort, setQuerySort] = useState('{"_id": -1}');
  const [queryLimit, setQueryLimit] = useState(20);
  const [querySkip, setQuerySkip] = useState(0);

  const [showCreateDbDialog, setShowCreateDbDialog] = useState(false);
  const [showCreateCollDialog, setShowCreateCollDialog] = useState(false);
  const [showCreateIndexDialog, setShowCreateIndexDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState<{ mode: 'view' | 'edit' | 'create'; doc?: any } | null>(null);
  
  const [newDbName, setNewDbName] = useState('');
  const [newCollName, setNewCollName] = useState('');
  const [newIndexKeys, setNewIndexKeys] = useState('{"field": 1}');
  const [newIndexUnique, setNewIndexUnique] = useState(false);
  const [documentJson, setDocumentJson] = useState('{}');

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'db' | 'coll' | 'doc' | 'index'; name: string; docId?: string } | null>(null);
  const [showChart, setShowChart] = useState(false);

  const baseUrl = `/projects/${projectId}/clusters/${clusterId}/explorer`;

  // Fetch databases
  const { data: databases, isLoading: loadingDbs, refetch: refetchDbs } = useQuery({
    queryKey: ['explorer-dbs', clusterId],
    queryFn: async () => {
      const res = await apiClient.get(`${baseUrl}/databases`);
      return res.data.data as DatabaseInfo[];
    },
    enabled: !!projectId,
  });

  // Fetch collections
  const { data: collections, isLoading: loadingColls, refetch: refetchColls } = useQuery({
    queryKey: ['explorer-colls', clusterId, selectedDb],
    queryFn: async () => {
      if (!selectedDb) return [];
      const res = await apiClient.get(`${baseUrl}/databases/${selectedDb}/collections`);
      return res.data.data as CollectionInfo[];
    },
    enabled: !!selectedDb && !!projectId,
  });

  // Fetch documents
  const { data: queryResult, isLoading: loadingDocs, refetch: refetchDocs } = useQuery({
    queryKey: ['explorer-docs', clusterId, selectedDb, selectedCollection, queryFilter, querySort, queryLimit, querySkip],
    queryFn: async () => {
      if (!selectedDb || !selectedCollection) return null;
      let filter = {};
      let sort = { _id: -1 };
      try { filter = JSON.parse(queryFilter); } catch {}
      try { sort = JSON.parse(querySort); } catch {}
      
      const res = await apiClient.post(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/find`, {
        filter,
        sort,
        limit: queryLimit,
        skip: querySkip,
      });
      return res.data.data as QueryResult;
    },
    enabled: !!selectedDb && !!selectedCollection && view === 'browse' && !!projectId,
  });

  // Fetch indexes
  const { data: indexes, isLoading: loadingIndexes, refetch: refetchIndexes } = useQuery({
    queryKey: ['explorer-indexes', clusterId, selectedDb, selectedCollection],
    queryFn: async () => {
      if (!selectedDb || !selectedCollection) return [];
      const res = await apiClient.get(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/indexes`);
      return res.data.data as IndexInfo[];
    },
    enabled: !!selectedDb && !!selectedCollection && view === 'indexes' && !!projectId,
  });

  // Mutations
  const createDbMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.post(`${baseUrl}/databases`, { name });
    },
    onSuccess: () => {
      refetchDbs();
      setShowCreateDbDialog(false);
      setNewDbName('');
      toast({ title: 'Database created' });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' });
    },
  });

  const createCollMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.post(`${baseUrl}/databases/${selectedDb}/collections`, { name });
    },
    onSuccess: () => {
      refetchColls();
      setShowCreateCollDialog(false);
      setNewCollName('');
      toast({ title: 'Collection created' });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' });
    },
  });

  const deleteDbMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(`${baseUrl}/databases/${name}`);
    },
    onSuccess: () => {
      refetchDbs();
      setSelectedDb(null);
      setDeleteTarget(null);
      toast({ title: 'Database deleted' });
    },
  });

  const deleteCollMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(`${baseUrl}/databases/${selectedDb}/collections/${name}`);
    },
    onSuccess: () => {
      refetchColls();
      setSelectedCollection(null);
      setDeleteTarget(null);
      toast({ title: 'Collection deleted' });
    },
  });

  const insertDocMutation = useMutation({
    mutationFn: async (doc: any) => {
      await apiClient.post(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/documents`, { document: doc });
    },
    onSuccess: () => {
      refetchDocs();
      setShowDocumentDialog(null);
      toast({ title: 'Document inserted' });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, doc }: { id: string; doc: any }) => {
      await apiClient.put(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/documents/${id}`, { document: doc });
    },
    onSuccess: () => {
      refetchDocs();
      setShowDocumentDialog(null);
      toast({ title: 'Document updated' });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/documents/${id}`);
    },
    onSuccess: () => {
      refetchDocs();
      setDeleteTarget(null);
      toast({ title: 'Document deleted' });
    },
  });

  const createIndexMutation = useMutation({
    mutationFn: async (data: { keys: any; unique: boolean }) => {
      await apiClient.post(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/indexes`, data);
    },
    onSuccess: () => {
      refetchIndexes();
      setShowCreateIndexDialog(false);
      toast({ title: 'Index created' });
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' });
    },
  });

  const deleteIndexMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(`${baseUrl}/databases/${selectedDb}/collections/${selectedCollection}/indexes/${name}`);
    },
    onSuccess: () => {
      refetchIndexes();
      setDeleteTarget(null);
      toast({ title: 'Index dropped' });
    },
  });

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    switch (deleteTarget.type) {
      case 'db': deleteDbMutation.mutate(deleteTarget.name); break;
      case 'coll': deleteCollMutation.mutate(deleteTarget.name); break;
      case 'doc': deleteDocMutation.mutate(deleteTarget.docId!); break;
      case 'index': deleteIndexMutation.mutate(deleteTarget.name); break;
    }
  };

  if (!projectId) {
    return (
      <EmptyState
        icon={<Database className="h-12 w-12" />}
        title="Missing Project ID"
        description="Please navigate to this page from the cluster detail page."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Explorer"
        description="Browse and manage your MongoDB data"
        action={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Cluster
          </Button>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar - Databases & Collections */}
        <div className="col-span-3 space-y-4">
          {/* Databases */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4" /> Databases
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowCreateDbDialog(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2 max-h-48 overflow-y-auto">
              {loadingDbs ? (
                <div className="flex justify-center p-4"><LoadingSpinner /></div>
              ) : databases && databases.length > 0 ? (
                databases.map((db) => (
                  <div
                    key={db.name}
                    onClick={() => { setSelectedDb(db.name); setSelectedCollection(null); }}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-muted ${selectedDb === db.name ? 'bg-muted' : ''}`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{db.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{db.collections}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-center text-sm text-muted-foreground p-4">No databases</div>
              )}
            </CardContent>
          </Card>

          {/* Collections */}
          {selectedDb && (
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Table className="h-4 w-4" /> Collections
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateCollDialog(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-2 max-h-64 overflow-y-auto">
                {loadingColls ? (
                  <div className="flex justify-center p-4"><LoadingSpinner /></div>
                ) : collections && collections.length > 0 ? (
                  collections.map((coll) => (
                    <div
                      key={coll.name}
                      onClick={() => { setSelectedCollection(coll.name); setView('browse'); }}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-muted ${selectedCollection === coll.name ? 'bg-muted' : ''}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <FileJson className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{coll.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{coll.documentCount.toLocaleString()}</Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-muted-foreground p-4">No collections</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="col-span-9">
          {selectedCollection ? (
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{selectedDb}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{selectedCollection}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={view === 'browse' ? 'default' : 'ghost'} onClick={() => setView('browse')}>
                      <FileJson className="h-4 w-4 mr-1" /> Documents
                    </Button>
                    <Button size="sm" variant={view === 'indexes' ? 'default' : 'ghost'} onClick={() => setView('indexes')}>
                      <Key className="h-4 w-4 mr-1" /> Indexes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {view === 'browse' && (
                  <div className="space-y-4">
                    {/* Query Builder */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">Filter</Label>
                        <Input
                          value={queryFilter}
                          onChange={(e) => setQueryFilter(e.target.value)}
                          placeholder='{"status": "active"}'
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Sort</Label>
                        <Input
                          value={querySort}
                          onChange={(e) => setQuerySort(e.target.value)}
                          placeholder='{"_id": -1}'
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button size="sm" onClick={() => refetchDocs()}>
                          <Search className="h-4 w-4 mr-1" /> Query
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowDocumentDialog({ mode: 'create' })}>
                          <Plus className="h-4 w-4 mr-1" /> Insert
                        </Button>
                        <Button size="sm" variant={showChart ? 'default' : 'outline'} onClick={() => setShowChart(!showChart)}>
                          <BarChart3 className="h-4 w-4 mr-1" /> Chart
                        </Button>
                      </div>
                    </div>

                    {/* Results */}
                    {/* Chart Visualization */}
                    {showChart && queryResult && queryResult.documents.length > 0 && (
                      <QueryResultChart data={queryResult.documents} onClose={() => setShowChart(false)} />
                    )}

                    {loadingDocs ? (
                      <div className="flex justify-center p-8"><LoadingSpinner /></div>
                    ) : queryResult ? (
                      <>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{queryResult.totalCount.toLocaleString()} documents | {queryResult.executionTime}ms</span>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" disabled={querySkip === 0} onClick={() => setQuerySkip(Math.max(0, querySkip - queryLimit))}>
                              Prev
                            </Button>
                            <span>Page {Math.floor(querySkip / queryLimit) + 1}</span>
                            <Button size="sm" variant="outline" disabled={querySkip + queryLimit >= queryResult.totalCount} onClick={() => setQuerySkip(querySkip + queryLimit)}>
                              Next
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {queryResult.documents.map((doc, i) => (
                            <div key={doc._id || i} className="bg-muted/50 rounded p-3 font-mono text-xs relative group">
                              <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                                {JSON.stringify(doc, null, 2)}
                              </pre>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setDocumentJson(JSON.stringify(doc, null, 2)); setShowDocumentDialog({ mode: 'view', doc }); }}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setDocumentJson(JSON.stringify(doc, null, 2)); setShowDocumentDialog({ mode: 'edit', doc }); }}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget({ type: 'doc', name: doc._id, docId: doc._id })}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={<FileJson className="h-10 w-10" />} title="No documents" description="This collection is empty." />
                    )}
                  </div>
                )}

                {view === 'indexes' && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => setShowCreateIndexDialog(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Create Index
                      </Button>
                    </div>
                    {loadingIndexes ? (
                      <div className="flex justify-center p-8"><LoadingSpinner /></div>
                    ) : indexes && indexes.length > 0 ? (
                      <div className="space-y-2">
                        {indexes.map((idx) => (
                          <div key={idx.name} className="flex items-center justify-between bg-muted/50 rounded p-3">
                            <div>
                              <div className="font-medium text-sm">{idx.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {JSON.stringify(idx.key)}
                                {idx.unique && <Badge variant="outline" className="ml-2">Unique</Badge>}
                                {idx.sparse && <Badge variant="outline" className="ml-2">Sparse</Badge>}
                              </div>
                            </div>
                            {idx.name !== '_id_' && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: 'index', name: idx.name })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={<Key className="h-10 w-10" />} title="No indexes" description="Only the default _id index exists." />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8">
                <EmptyState
                  icon={<Database className="h-12 w-12" />}
                  title="Select a collection"
                  description="Choose a database and collection from the sidebar to explore your data."
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Database Dialog */}
      <Dialog open={showCreateDbDialog} onOpenChange={setShowCreateDbDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Database</DialogTitle>
            <DialogDescription>Enter a name for the new database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input value={newDbName} onChange={(e) => setNewDbName(e.target.value)} placeholder="my_database" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDbDialog(false)}>Cancel</Button>
              <Button onClick={() => createDbMutation.mutate(newDbName)} disabled={!newDbName || createDbMutation.isPending}>
                {createDbMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Collection Dialog */}
      <Dialog open={showCreateCollDialog} onOpenChange={setShowCreateCollDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>Create a new collection in {selectedDb}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Collection Name</Label>
              <Input value={newCollName} onChange={(e) => setNewCollName(e.target.value)} placeholder="my_collection" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateCollDialog(false)}>Cancel</Button>
              <Button onClick={() => createCollMutation.mutate(newCollName)} disabled={!newCollName || createCollMutation.isPending}>
                {createCollMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Index Dialog */}
      <Dialog open={showCreateIndexDialog} onOpenChange={setShowCreateIndexDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Index</DialogTitle>
            <DialogDescription>Create a new index on {selectedCollection}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Index Keys (JSON)</Label>
              <Input value={newIndexKeys} onChange={(e) => setNewIndexKeys(e.target.value)} placeholder='{"email": 1}' className="font-mono" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="unique" checked={newIndexUnique} onChange={(e) => setNewIndexUnique(e.target.checked)} />
              <Label htmlFor="unique">Unique</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateIndexDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  try {
                    const keys = JSON.parse(newIndexKeys);
                    createIndexMutation.mutate({ keys, unique: newIndexUnique });
                  } catch {
                    toast({ title: 'Invalid JSON', variant: 'destructive' });
                  }
                }}
                disabled={createIndexMutation.isPending}
              >
                {createIndexMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Dialog */}
      <Dialog open={!!showDocumentDialog} onOpenChange={(open) => !open && setShowDocumentDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {showDocumentDialog?.mode === 'create' ? 'Insert Document' : showDocumentDialog?.mode === 'edit' ? 'Edit Document' : 'View Document'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={documentJson}
              onChange={(e) => setDocumentJson(e.target.value)}
              placeholder='{"name": "John", "email": "john@example.com"}'
              className="font-mono text-sm min-h-[300px]"
              readOnly={showDocumentDialog?.mode === 'view'}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDocumentDialog(null)}>Cancel</Button>
              {showDocumentDialog?.mode !== 'view' && (
                <Button
                  onClick={() => {
                    try {
                      const doc = JSON.parse(documentJson);
                      if (showDocumentDialog?.mode === 'create') {
                        insertDocMutation.mutate(doc);
                      } else {
                        updateDocMutation.mutate({ id: showDocumentDialog!.doc._id, doc });
                      }
                    } catch {
                      toast({ title: 'Invalid JSON', variant: 'destructive' });
                    }
                  }}
                  disabled={insertDocMutation.isPending || updateDocMutation.isPending}
                >
                  {showDocumentDialog?.mode === 'create' ? 'Insert' : 'Update'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${deleteTarget?.type === 'db' ? 'Database' : deleteTarget?.type === 'coll' ? 'Collection' : deleteTarget?.type === 'index' ? 'Index' : 'Document'}`}
        description={`Are you sure you want to delete ${deleteTarget?.type === 'doc' ? 'this document' : `"${deleteTarget?.name}"`}? This action cannot be undone.`}
        confirmText="Delete"
        isDestructive
        isLoading={deleteDbMutation.isPending || deleteCollMutation.isPending || deleteDocMutation.isPending || deleteIndexMutation.isPending}
      />
    </div>
  );
}

