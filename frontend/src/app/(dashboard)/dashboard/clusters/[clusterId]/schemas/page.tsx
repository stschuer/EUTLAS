'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  FileCode,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  History,
  Play,
  Sparkles,
  Copy,
  FileJson,
  Database,
  Loader2,
  RotateCcw,
} from 'lucide-react';

export default function SchemaValidationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<any>(null);
  const [deleteSchema, setDeleteSchema] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [database, setDatabase] = useState('');
  const [collection, setCollection] = useState('');
  const [jsonSchema, setJsonSchema] = useState('{\n  "bsonType": "object",\n  "required": [],\n  "properties": {}\n}');
  const [validationLevel, setValidationLevel] = useState('strict');
  const [validationAction, setValidationAction] = useState('error');
  const [description, setDescription] = useState('');

  // Validation test state
  const [testDocument, setTestDocument] = useState('{}');
  const [validationResult, setValidationResult] = useState<any>(null);

  const baseUrl = `/projects/${projectId}/clusters/${clusterId}/schemas`;

  const { data: schemas, isLoading } = useQuery({
    queryKey: ['schemas', clusterId],
    queryFn: async () => {
      const res = await apiClient.get(baseUrl);
      return res.success ? res.data : [];
    },
    enabled: !!projectId && !!clusterId,
  });

  const { data: templates } = useQuery({
    queryKey: ['schema-templates'],
    queryFn: async () => {
      const res = await apiClient.get(`${baseUrl}/templates`);
      return res.success ? res.data : [];
    },
    enabled: !!projectId && !!clusterId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(baseUrl, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas', clusterId] });
      toast({ title: 'Schema created', description: 'Collection schema has been saved' });
      setShowCreateForm(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiClient.patch(`${baseUrl}/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas', clusterId] });
      toast({ title: 'Schema updated' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${baseUrl}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas', clusterId] });
      toast({ title: 'Schema deleted' });
      setDeleteSchema(null);
      setSelectedSchema(null);
    },
  });

  const validateMutation = useMutation({
    mutationFn: async ({ schemaId, document }: { schemaId: string; document: any }) => {
      return apiClient.post(`${baseUrl}/${schemaId}/validate`, { document });
    },
    onSuccess: (res) => {
      setValidationResult(res.data);
    },
    onError: (error: any) => {
      toast({ title: 'Validation Error', description: error.message, variant: 'destructive' });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (sampleDocuments: any[]) => apiClient.post(`${baseUrl}/generate`, { sampleDocuments }),
    onSuccess: (res) => {
      setJsonSchema(JSON.stringify(res.data, null, 2));
      toast({ title: 'Schema generated', description: 'Schema inferred from sample documents' });
    },
  });

  const resetForm = () => {
    setDatabase('');
    setCollection('');
    setJsonSchema('{\n  "bsonType": "object",\n  "required": [],\n  "properties": {}\n}');
    setValidationLevel('strict');
    setValidationAction('error');
    setDescription('');
  };

  const handleCreate = () => {
    try {
      const schema = JSON.parse(jsonSchema);
      createMutation.mutate({
        database,
        collection,
        jsonSchema: schema,
        validationLevel,
        validationAction,
        description,
      });
    } catch (e) {
      toast({ title: 'Invalid JSON', description: 'Please check your schema JSON', variant: 'destructive' });
    }
  };

  const handleValidate = () => {
    if (!selectedSchema) return;
    try {
      const doc = JSON.parse(testDocument);
      validateMutation.mutate({ schemaId: selectedSchema.id, document: doc });
    } catch (e) {
      toast({ title: 'Invalid JSON', description: 'Please check your document JSON', variant: 'destructive' });
    }
  };

  const applyTemplate = (template: any) => {
    setJsonSchema(JSON.stringify(template.schema, null, 2));
    toast({ title: 'Template applied', description: template.name });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schema Validation"
        description="Define and manage JSON Schema validation rules for your collections"
      />

      <div className="grid grid-cols-12 gap-6">
        {/* Schema List */}
        <div className="col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Collection Schemas</h3>
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>

          {schemas && schemas.length > 0 ? (
            <div className="space-y-2">
              {schemas.map((schema: any) => (
                <Card
                  key={schema.id}
                  className={`cursor-pointer transition-all ${selectedSchema?.id === schema.id ? 'border-primary' : 'hover:border-primary/50'}`}
                  onClick={() => setSelectedSchema(schema)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{schema.database}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <FileJson className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{schema.collection}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={schema.isActive ? 'default' : 'secondary'}>
                          {schema.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">v{schema.currentVersion}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileCode className="h-10 w-10" />}
              title="No schemas defined"
              description="Create a schema to enforce document structure"
            />
          )}
        </div>

        {/* Schema Editor / Details */}
        <div className="col-span-8">
          {showCreateForm ? (
            <Card>
              <CardHeader>
                <CardTitle>Create Schema</CardTitle>
                <CardDescription>Define validation rules for a collection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Database</Label>
                    <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="myDatabase" />
                  </div>
                  <div className="space-y-2">
                    <Label>Collection</Label>
                    <Input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="myCollection" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>JSON Schema</Label>
                    <Select onValueChange={(val) => {
                      const template = templates?.find((t: any) => t.name === val);
                      if (template) applyTemplate(template);
                    }}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Use template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates?.map((t: any) => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    value={jsonSchema}
                    onChange={(e) => setJsonSchema(e.target.value)}
                    className="font-mono text-sm min-h-[300px]"
                    placeholder="Enter JSON Schema..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Validation Level</Label>
                    <Select value={validationLevel} onValueChange={setValidationLevel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strict">Strict - All documents must match</SelectItem>
                        <SelectItem value="moderate">Moderate - Existing docs exempt</SelectItem>
                        <SelectItem value="off">Off - No validation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Validation Action</Label>
                    <Select value={validationAction} onValueChange={setValidationAction}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="error">Error - Reject invalid documents</SelectItem>
                        <SelectItem value="warn">Warn - Log but allow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Schema description..." />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowCreateForm(false); resetForm(); }}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !database || !collection}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Schema
                </Button>
              </CardFooter>
            </Card>
          ) : selectedSchema ? (
            <Tabs defaultValue="schema">
              <TabsList>
                <TabsTrigger value="schema">Schema</TabsTrigger>
                <TabsTrigger value="validate">Test Validation</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="schema" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{selectedSchema.database}.{selectedSchema.collection}</CardTitle>
                        <CardDescription>{selectedSchema.description || 'No description'}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(selectedSchema.jsonSchema, null, 2));
                            toast({ title: 'Copied to clipboard' });
                          }}
                        >
                          <Copy className="h-4 w-4 mr-1" /> Copy
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteSchema({ id: selectedSchema.id, name: `${selectedSchema.database}.${selectedSchema.collection}` })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <Badge variant={selectedSchema.validationLevel === 'strict' ? 'default' : 'secondary'}>
                        {selectedSchema.validationLevel}
                      </Badge>
                      <Badge variant={selectedSchema.validationAction === 'error' ? 'destructive' : 'outline'}>
                        {selectedSchema.validationAction}
                      </Badge>
                      <span className="text-sm text-muted-foreground">Version {selectedSchema.currentVersion}</span>
                    </div>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[400px] text-sm font-mono">
                      {JSON.stringify(selectedSchema.jsonSchema, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="validate" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Test Document Validation</CardTitle>
                    <CardDescription>Enter a JSON document to validate against the schema</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={testDocument}
                      onChange={(e) => setTestDocument(e.target.value)}
                      placeholder='{"name": "John", "email": "john@example.com"}'
                      className="font-mono text-sm min-h-[200px]"
                    />
                    <Button onClick={handleValidate} disabled={validateMutation.isPending}>
                      <Play className="h-4 w-4 mr-2" />
                      Validate Document
                    </Button>

                    {validationResult && (
                      <div className={`p-4 rounded-lg ${validationResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {validationResult.valid ? (
                            <><CheckCircle className="h-5 w-5 text-green-600" /><span className="font-medium text-green-800">Valid Document</span></>
                          ) : (
                            <><XCircle className="h-5 w-5 text-red-600" /><span className="font-medium text-red-800">Invalid Document</span></>
                          )}
                        </div>
                        {validationResult.errors && validationResult.errors.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {validationResult.errors.map((err: any, i: number) => (
                              <p key={i} className="text-sm text-red-700">
                                {err.instancePath || '/'}: {err.message}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Schema Version History</CardTitle>
                    <CardDescription>Previous versions of this schema</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedSchema.history?.length > 0 ? (
                      <div className="space-y-3">
                        {selectedSchema.history.slice().reverse().map((h: any) => (
                          <div key={h.version} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <div className="flex items-center gap-2">
                                <History className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">Version {h.version}</span>
                                {h.version === selectedSchema.currentVersion && (
                                  <Badge variant="outline">Current</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {h.comment || 'No comment'} • {formatDate(h.changedAt)}
                              </p>
                            </div>
                            {h.version !== selectedSchema.currentVersion && (
                              <Button variant="ghost" size="sm">
                                <RotateCcw className="h-4 w-4 mr-1" /> Revert
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No history available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="p-8">
                <EmptyState
                  icon={<FileCode className="h-12 w-12" />}
                  title="Select a schema"
                  description="Choose a schema from the list or create a new one"
                  action={<Button onClick={() => setShowCreateForm(true)}><Plus className="h-4 w-4 mr-2" /> Create Schema</Button>}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteSchema}
        onOpenChange={() => setDeleteSchema(null)}
        title="Delete Schema"
        description={`Are you sure you want to delete the schema for "${deleteSchema?.name}"?`}
        onConfirm={() => deleteSchema && deleteMutation.mutate(deleteSchema.id)}
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}



