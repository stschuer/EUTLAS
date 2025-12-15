'use client';

import { useState } from 'react';
import { useCreateSearchIndex, useSearchIndexAnalyzers } from '@/hooks/use-search-indexes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Search, Zap } from 'lucide-react';

interface CreateSearchIndexFormProps {
  projectId: string;
  clusterId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultDatabase?: string;
  defaultCollection?: string;
}

export function CreateSearchIndexForm({
  projectId,
  clusterId,
  onSuccess,
  onCancel,
  defaultDatabase,
  defaultCollection,
}: CreateSearchIndexFormProps) {
  const [name, setName] = useState('');
  const [database, setDatabase] = useState(defaultDatabase || '');
  const [collection, setCollection] = useState(defaultCollection || '');
  const [indexType, setIndexType] = useState<'search' | 'vectorSearch'>('search');
  const [dynamicMapping, setDynamicMapping] = useState(true);
  const [analyzer, setAnalyzer] = useState('lucene.standard');
  const [customDefinition, setCustomDefinition] = useState('');
  const [useCustomDefinition, setUseCustomDefinition] = useState(false);

  // Vector search specific
  const [vectorPath, setVectorPath] = useState('');
  const [numDimensions, setNumDimensions] = useState(1536);
  const [similarity, setSimilarity] = useState<'euclidean' | 'cosine' | 'dotProduct'>('cosine');

  const { toast } = useToast();
  const createMutation = useCreateSearchIndex();
  const { data: analyzers } = useSearchIndexAnalyzers(projectId, clusterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !database || !collection) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    let definition: any;

    if (useCustomDefinition) {
      try {
        definition = JSON.parse(customDefinition);
      } catch (error) {
        toast({ title: 'Error', description: 'Invalid JSON in custom definition', variant: 'destructive' });
        return;
      }
    } else if (indexType === 'search') {
      definition = {
        mappings: {
          dynamic: dynamicMapping,
        },
      };
    } else {
      // Vector search
      if (!vectorPath) {
        toast({ title: 'Error', description: 'Vector path is required for vector search', variant: 'destructive' });
        return;
      }
      definition = {
        fields: [
          {
            type: 'vector',
            path: vectorPath,
            numDimensions,
            similarity,
          },
        ],
      };
    }

    try {
      await createMutation.mutateAsync({
        projectId,
        clusterId,
        data: {
          name,
          database,
          collection,
          type: indexType,
          definition,
          analyzer: indexType === 'search' ? analyzer : undefined,
        },
      });
      toast({ title: 'Index created', description: `"${name}" is being built` });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Search Index</CardTitle>
        <CardDescription>
          Create an Atlas Search or Vector Search index on your collection
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {/* Index Type */}
          <div className="grid grid-cols-2 gap-4">
            <Card
              className={`cursor-pointer transition-all ${
                indexType === 'search' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : ''
              }`}
              onClick={() => setIndexType('search')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Search className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium">Full-Text Search</div>
                  <div className="text-sm text-muted-foreground">Lucene-based search</div>
                </div>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all ${
                indexType === 'vectorSearch' ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20' : ''
              }`}
              onClick={() => setIndexType('vectorSearch')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Zap className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="font-medium">Vector Search</div>
                  <div className="text-sm text-muted-foreground">Semantic search</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Basic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Index Name *</Label>
              <Input
                id="name"
                placeholder="my_search_index"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="database">Database *</Label>
              <Input
                id="database"
                placeholder="myDatabase"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection">Collection *</Label>
              <Input
                id="collection"
                placeholder="myCollection"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Search-specific options */}
          {indexType === 'search' && !useCustomDefinition && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Dynamic Mapping</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically index all fields
                  </p>
                </div>
                <Switch
                  checked={dynamicMapping}
                  onCheckedChange={setDynamicMapping}
                />
              </div>
              <div className="space-y-2">
                <Label>Analyzer</Label>
                <Select value={analyzer} onValueChange={setAnalyzer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(analyzers || ['lucene.standard', 'lucene.simple', 'lucene.keyword']).map((a: string) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Vector search options */}
          {indexType === 'vectorSearch' && !useCustomDefinition && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vectorPath">Vector Field Path *</Label>
                <Input
                  id="vectorPath"
                  placeholder="embedding"
                  value={vectorPath}
                  onChange={(e) => setVectorPath(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The path to the field containing vector embeddings
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numDimensions">Dimensions</Label>
                  <Input
                    id="numDimensions"
                    type="number"
                    value={numDimensions}
                    onChange={(e) => setNumDimensions(parseInt(e.target.value))}
                    min={1}
                    max={4096}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Similarity Function</Label>
                  <Select value={similarity} onValueChange={(v: any) => setSimilarity(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cosine">Cosine</SelectItem>
                      <SelectItem value="euclidean">Euclidean</SelectItem>
                      <SelectItem value="dotProduct">Dot Product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Custom Definition Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Use Custom Definition</Label>
              <p className="text-sm text-muted-foreground">
                Provide a custom JSON index definition
              </p>
            </div>
            <Switch
              checked={useCustomDefinition}
              onCheckedChange={setUseCustomDefinition}
            />
          </div>

          {/* Custom Definition Editor */}
          {useCustomDefinition && (
            <div className="space-y-2">
              <Label>Index Definition (JSON)</Label>
              <Textarea
                className="font-mono text-sm h-48"
                placeholder={indexType === 'search' 
                  ? '{\n  "mappings": {\n    "dynamic": true\n  }\n}'
                  : '{\n  "fields": [\n    {\n      "type": "vector",\n      "path": "embedding",\n      "numDimensions": 1536,\n      "similarity": "cosine"\n    }\n  ]\n}'
                }
                value={customDefinition}
                onChange={(e) => setCustomDefinition(e.target.value)}
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Index
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}





