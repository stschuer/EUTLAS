'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  Eye,
  EyeOff,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Shield,
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  publicKey: string;
  scopes: string[];
  allowedIps: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string; email: string };
}

interface NewApiKeyResponse {
  id: string;
  name: string;
  publicKey: string;
  secretKey: string; // Only returned once!
  scopes: string[];
}

const availableScopes = [
  { scope: 'clusters:read', description: 'Read cluster information' },
  { scope: 'clusters:write', description: 'Create, update, delete clusters' },
  { scope: 'projects:read', description: 'Read project information' },
  { scope: 'projects:write', description: 'Create, update, delete projects' },
  { scope: 'backups:read', description: 'Read backup information' },
  { scope: 'backups:write', description: 'Create, restore, delete backups' },
  { scope: 'metrics:read', description: 'Read cluster metrics' },
  { scope: 'members:read', description: 'Read organization members' },
  { scope: 'members:write', description: 'Invite and manage members' },
];

export default function ApiKeysPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewApiKeyResponse | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);

  const [newKey, setNewKey] = useState({
    name: '',
    description: '',
    scopes: ['clusters:read', 'projects:read'],
  });

  // Fetch API keys
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys', orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/orgs/${orgId}/api-keys`);
      return response.data.data as ApiKey[];
    },
  });

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newKey) => {
      const response = await apiClient.post(`/orgs/${orgId}/api-keys`, data);
      return response.data.data as NewApiKeyResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
      setNewKeyData(data);
      setShowCreateDialog(false);
      setShowSecretDialog(true);
      setNewKey({ name: '', description: '', scopes: ['clusters:read', 'projects:read'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create API key',
        variant: 'destructive',
      });
    },
  });

  // Delete API key mutation
  const deleteMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiClient.delete(`/orgs/${orgId}/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
      setDeleteKeyId(null);
      toast({ title: 'API key deleted' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete API key',
        variant: 'destructive',
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ keyId, isActive }: { keyId: string; isActive: boolean }) => {
      await apiClient.patch(`/orgs/${orgId}/api-keys/${keyId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', orgId] });
      toast({ title: 'API key updated' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update API key',
        variant: 'destructive',
      });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const copySecret = () => {
    if (newKeyData) {
      navigator.clipboard.writeText(`${newKeyData.publicKey}:${newKeyData.secretKey}`);
      setSecretCopied(true);
      toast({ title: 'API key copied to clipboard' });
    }
  };

  const toggleScope = (scope: string) => {
    setNewKey((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage programmatic access to your organization"
        action={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key for programmatic access. The secret key will only be shown once.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(newKey);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Production API Key"
                    value={newKey.name}
                    onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Used by CI/CD pipeline..."
                    value={newKey.description}
                    onChange={(e) => setNewKey({ ...newKey, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="grid gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
                    {availableScopes.map((item) => (
                      <div key={item.scope} className="flex items-start gap-2">
                        <Checkbox
                          id={item.scope}
                          checked={newKey.scopes.includes(item.scope)}
                          onCheckedChange={() => toggleScope(item.scope)}
                        />
                        <label htmlFor={item.scope} className="text-sm cursor-pointer">
                          <span className="font-medium">{item.scope}</span>
                          <p className="text-muted-foreground text-xs">{item.description}</p>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || newKey.scopes.length === 0}>
                    {createMutation.isPending ? 'Creating...' : 'Create Key'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Secret Key Dialog */}
      <Dialog open={showSecretDialog} onOpenChange={(open) => {
        if (!open && secretCopied) {
          setShowSecretDialog(false);
          setNewKeyData(null);
          setSecretCopied(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              This is the only time you will see the secret key. Copy and save it securely now.
            </DialogDescription>
          </DialogHeader>
          {newKeyData && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Public Key</Label>
                <div className="flex gap-2">
                  <Input value={newKeyData.publicKey} readOnly className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newKeyData.publicKey, 'Public key')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Secret Key</Label>
                <div className="flex gap-2">
                  <Input value={newKeyData.secretKey} readOnly className="font-mono text-sm" type="password" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newKeyData.secretKey, 'Secret key')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-muted p-3 rounded-md">
                <Label className="text-sm">Full API Key (for X-API-Key header)</Label>
                <code className="block mt-1 text-xs break-all">
                  {newKeyData.publicKey}:{newKeyData.secretKey}
                </code>
              </div>
              <Button onClick={copySecret} className="w-full">
                {secretCopied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Copied! Click to Close
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Full API Key
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* API Keys List */}
      {apiKeys && apiKeys.length > 0 ? (
        <div className="space-y-4">
          {apiKeys.map((apiKey) => (
            <Card key={apiKey.id} className={!apiKey.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <Key className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {apiKey.name}
                        {!apiKey.isActive && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground font-mono">
                        {apiKey.publicKey}
                      </div>
                      {apiKey.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {apiKey.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {apiKey.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Created {new Date(apiKey.createdAt).toLocaleDateString()}
                        {apiKey.lastUsedAt && (
                          <> • Last used {new Date(apiKey.lastUsedAt).toLocaleDateString()}</>
                        )}
                        {apiKey.usageCount > 0 && <> • {apiKey.usageCount} requests</>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate({ 
                        keyId: apiKey.id, 
                        isActive: !apiKey.isActive 
                      })}
                    >
                      {apiKey.isActive ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteKeyId(apiKey.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Key className="h-12 w-12" />}
          title="No API Keys"
          description="Create your first API key for programmatic access"
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          }
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteKeyId}
        onClose={() => setDeleteKeyId(null)}
        onConfirm={() => deleteKeyId && deleteMutation.mutate(deleteKeyId)}
        title="Delete API Key"
        description="Are you sure you want to delete this API key? Any applications using this key will lose access immediately."
        confirmText="Delete Key"
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}


