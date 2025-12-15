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
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { 
  Plus, 
  User, 
  Trash2, 
  Shield, 
  Database,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';

interface DatabaseRole {
  role: string;
  db: string;
}

interface DatabaseUser {
  id: string;
  username: string;
  roles: DatabaseRole[];
  scopes: string[];
  isActive: boolean;
  createdAt: string;
}

const AVAILABLE_ROLES = [
  { value: 'read', label: 'Read', description: 'Read-only access' },
  { value: 'readWrite', label: 'Read/Write', description: 'Read and write access' },
  { value: 'dbAdmin', label: 'DB Admin', description: 'Database administration' },
  { value: 'dbOwner', label: 'DB Owner', description: 'Full database control' },
  { value: 'readAnyDatabase', label: 'Read Any', description: 'Read all databases' },
  { value: 'readWriteAnyDatabase', label: 'Read/Write Any', description: 'Access all databases' },
];

export default function DatabaseUsersPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const projectId = params.projectId as string || 'default';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    roles: [{ role: 'readWrite', db: '' }],
  });

  // Fetch database users
  const { data, isLoading, error } = useQuery({
    queryKey: ['database-users', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/users`);
      return response.data.data as DatabaseUser[];
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/users`,
        userData
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database-users', clusterId] });
      setShowCreateForm(false);
      setNewUser({ username: '', password: '', roles: [{ role: 'readWrite', db: '' }] });
      toast({
        title: 'User created',
        description: 'Database user has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create user',
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database-users', clusterId] });
      setDeleteUserId(null);
      toast({
        title: 'User deleted',
        description: 'Database user has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete user',
        variant: 'destructive',
      });
    },
  });

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewUser({ ...newUser, password });
  };

  const copyPassword = async () => {
    await navigator.clipboard.writeText(newUser.password);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
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
        title="Database Users"
        description="Manage MongoDB users for this cluster"
        action={
          !showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          )
        }
      />

      {/* Create User Form */}
      {showCreateForm && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Create Database User
            </CardTitle>
            <CardDescription>
              Add a new MongoDB user with specific database permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(newUser);
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="app_user"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        required
                        className="pr-20"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        {newUser.password && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={copyPassword}
                          >
                            {copiedPassword ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button type="button" variant="outline" onClick={generatePassword}>
                      Generate
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex gap-2">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newUser.roles[0]?.role || 'readWrite'}
                    onChange={(e) => setNewUser({
                      ...newUser,
                      roles: [{ ...newUser.roles[0], role: e.target.value }],
                    })}
                  >
                    {AVAILABLE_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label} - {role.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="database">Database (leave empty for all)</Label>
                <Input
                  id="database"
                  placeholder="my_database"
                  value={newUser.roles[0]?.db || ''}
                  onChange={(e) => setNewUser({
                    ...newUser,
                    roles: [{ ...newUser.roles[0], db: e.target.value || 'admin' }],
                  })}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <LoadingSpinner className="h-4 w-4 mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create User'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users List */}
      {data && data.length > 0 ? (
        <div className="grid gap-4">
          {data.map((user) => (
            <Card key={user.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {user.username}
                        {!user.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Created {new Date(user.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((role, idx) => (
                        <Badge key={idx} variant="outline" className="gap-1">
                          <Shield className="h-3 w-3" />
                          {role.role}
                          {role.db && role.db !== 'admin' && (
                            <span className="text-muted-foreground">
                              @{role.db}
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteUserId(user.id)}
                      disabled={user.username === 'admin'}
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
          icon={<Database className="h-12 w-12" />}
          title="No database users"
          description="Create your first database user to connect to this cluster"
          action={
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          }
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteUserId}
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => deleteUserId && deleteMutation.mutate(deleteUserId)}
        title="Delete Database User"
        description="Are you sure you want to delete this user? They will immediately lose access to the database."
        confirmText="Delete User"
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}





