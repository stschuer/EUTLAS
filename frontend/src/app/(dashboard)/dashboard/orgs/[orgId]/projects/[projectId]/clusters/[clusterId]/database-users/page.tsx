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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  Info,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface DatabaseInfo {
  name: string;
  sizeOnDisk?: number;
  empty?: boolean;
}

const ROLE_INFO = {
  read: {
    label: 'Read',
    description: 'View data only',
    icon: Eye,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  readWrite: {
    label: 'Read/Write',
    description: 'View and modify data',
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
  dbAdmin: {
    label: 'DB Admin',
    description: 'Manage database settings',
    icon: Shield,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  dbOwner: {
    label: 'DB Owner',
    description: 'Full database control',
    icon: Shield,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
  readAnyDatabase: {
    label: 'Read All DBs',
    description: 'Read all databases',
    icon: Globe,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
  },
  readWriteAnyDatabase: {
    label: 'Read/Write All DBs',
    description: 'Access all databases',
    icon: Globe,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
};

type RoleKey = keyof typeof ROLE_INFO;

export default function DatabaseUsersPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;
  const clusterId = params.clusterId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [databaseScope, setDatabaseScope] = useState<'specific' | 'all'>('specific');
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'readWrite' as RoleKey,
    database: '',
  });

  // Fetch database users
  const { data: users, isLoading } = useQuery({
    queryKey: ['database-users', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/users`);
      return response.data.data as DatabaseUser[];
    },
  });

  // Fetch available databases
  const { data: databases, isLoading: loadingDatabases } = useQuery({
    queryKey: ['databases', clusterId],
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${projectId}/clusters/${clusterId}/explorer/databases`);
      return response.data.data as DatabaseInfo[];
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const payload = {
        username: userData.username,
        password: userData.password,
        roles: [{
          role: userData.role,
          db: databaseScope === 'all' ? 'admin' : (userData.database || 'admin'),
        }],
      };
      
      const response = await apiClient.post(
        `/projects/${projectId}/clusters/${clusterId}/users`,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['database-users', clusterId] });
      setShowCreateForm(false);
      setNewUser({ username: '', password: '', role: 'readWrite', database: '' });
      setDatabaseScope('specific');
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

  const getAccessPreview = () => {
    const roleInfo = ROLE_INFO[newUser.role];
    if (databaseScope === 'all' || newUser.role.includes('Any')) {
      return `${roleInfo.label} access to all databases`;
    }
    if (!newUser.database) {
      return 'Please select a database';
    }
    return `${roleInfo.label} access to "${newUser.database}"`;
  };

  const isFormValid = () => {
    if (!newUser.username || !newUser.password) return false;
    if (databaseScope === 'specific' && !newUser.database && !newUser.role.includes('Any')) {
      return false;
    }
    return true;
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
        <Card className="border-primary/20">
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
                if (isFormValid()) {
                  createMutation.mutate(newUser);
                }
              }}
              className="space-y-6"
            >
              {/* Credentials */}
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="username">
                      Username <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="username"
                      placeholder="app_user"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Password <span className="text-destructive">*</span>
                    </Label>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{showPassword ? 'Hide password' : 'Show password'}</TooltipContent>
                          </Tooltip>
                          {newUser.password && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={copyPassword}
                                >
                                  {copiedPassword ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{copiedPassword ? 'Copied!' : 'Copy password'}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <Button type="button" variant="outline" onClick={generatePassword}>
                        Generate
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Role Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>
                    Permission Level <span className="text-destructive">*</span>
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Choose the level of access this user will have to the database(s)
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(Object.keys(ROLE_INFO) as RoleKey[]).map((roleKey) => {
                    const role = ROLE_INFO[roleKey];
                    const Icon = role.icon;
                    const isSelected = newUser.role === roleKey;
                    
                    return (
                      <button
                        key={roleKey}
                        type="button"
                        onClick={() => setNewUser({ ...newUser, role: roleKey })}
                        className={cn(
                          "relative p-4 rounded-lg border-2 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("p-2 rounded-lg", role.bg)}>
                            <Icon className={cn("h-4 w-4", role.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{role.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {role.description}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Database Scope */}
              {!newUser.role.includes('Any') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label>
                      Database Access <span className="text-destructive">*</span>
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Choose whether this user can access a specific database or all databases
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <RadioGroup
                    value={databaseScope}
                    onValueChange={(value: 'specific' | 'all') => setDatabaseScope(value)}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                      <RadioGroupItem value="specific" id="specific" />
                      <Label htmlFor="specific" className="flex-1 cursor-pointer">
                        <div className="font-medium">Specific Database</div>
                        <div className="text-sm text-muted-foreground">
                          Restrict access to a single database
                        </div>
                      </Label>
                    </div>

                    <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                      <RadioGroupItem value="all" id="all" />
                      <Label htmlFor="all" className="flex-1 cursor-pointer">
                        <div className="font-medium">All Databases</div>
                        <div className="text-sm text-muted-foreground">
                          Grant access to all current and future databases
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>

                  {databaseScope === 'specific' && (
                    <div className="space-y-2">
                      <Label htmlFor="database">
                        Select Database <span className="text-destructive">*</span>
                      </Label>
                      {loadingDatabases ? (
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                          <LoadingSpinner className="h-4 w-4" />
                          <span className="text-sm text-muted-foreground">Loading databases...</span>
                        </div>
                      ) : databases && databases.length > 0 ? (
                        <Select
                          value={newUser.database}
                          onValueChange={(value) => setNewUser({ ...newUser, database: value })}
                        >
                          <SelectTrigger id="database">
                            <SelectValue placeholder="Choose a database" />
                          </SelectTrigger>
                          <SelectContent>
                            {databases.map((db) => (
                              <SelectItem key={db.name} value={db.name}>
                                <div className="flex items-center gap-2">
                                  <Database className="h-3 w-3" />
                                  {db.name}
                                  {db.empty && (
                                    <Badge variant="secondary" className="text-xs ml-2">Empty</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            No databases found. Create your first database in the Data Explorer to proceed.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Access Preview */}
              <Alert className="border-primary/20 bg-primary/5">
                <Shield className="h-4 w-4 text-primary" />
                <AlertDescription>
                  <strong>Access Preview:</strong> This user will have <strong>{getAccessPreview()}</strong>
                </AlertDescription>
              </Alert>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewUser({ username: '', password: '', role: 'readWrite', database: '' });
                    setDatabaseScope('specific');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || !isFormValid()}
                >
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
      {users && users.length > 0 ? (
        <div className="grid gap-4">
          {users.map((user) => {
            const primaryRole = user.roles[0];
            const roleInfo = primaryRole ? ROLE_INFO[primaryRole.role as RoleKey] : null;
            const RoleIcon = roleInfo?.icon || Shield;

            return (
              <Card key={user.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={cn(
                        "h-12 w-12 rounded-lg flex items-center justify-center",
                        roleInfo?.bg || "bg-primary/10"
                      )}>
                        <User className={cn("h-6 w-6", roleInfo?.color || "text-primary")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold flex items-center gap-2">
                          {user.username}
                          {!user.isActive && (
                            <Badge variant="secondary" className="text-xs">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          Created {new Date(user.createdAt).toLocaleDateString()}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {user.roles.map((role, idx) => {
                            const info = ROLE_INFO[role.role as RoleKey];
                            const Icon = info?.icon || Shield;
                            return (
                              <Badge key={idx} variant="outline" className="gap-1.5">
                                <Icon className="h-3 w-3" />
                                {info?.label || role.role}
                                {role.db && role.db !== 'admin' && (
                                  <>
                                    <span className="text-muted-foreground">@</span>
                                    <Database className="h-3 w-3" />
                                    <span>{role.db}</span>
                                  </>
                                )}
                                {role.db === 'admin' && (
                                  <span className="text-muted-foreground">(all)</span>
                                )}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteUserId(user.id)}
                          disabled={user.username === 'admin'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {user.username === 'admin' ? 'Cannot delete admin user' : 'Delete user'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
