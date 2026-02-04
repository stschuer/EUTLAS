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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  UserPlus, 
  Users, 
  Mail, 
  MoreVertical, 
  Shield, 
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Crown,
} from 'lucide-react';

interface Member {
  id: string;
  userId: { 
    id: string; 
    name?: string;
    email: string;
  };
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: { name?: string; email: string };
}

const roleColors: Record<string, string> = {
  OWNER: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  ADMIN: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  MEMBER: 'bg-green-500/10 text-green-600 border-green-500/20',
  READONLY: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

const roleLabels: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  READONLY: 'Read Only',
};

export default function TeamPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER' | 'READONLY'>('MEMBER');
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [revokeInvitationId, setRevokeInvitationId] = useState<string | null>(null);

  // Fetch members
  const { data: members, isLoading: loadingMembers, error: membersError } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/orgs/${orgId}/members`);
      return (response.data ?? []) as Member[];
    },
  });

  // Fetch invitations
  const { data: invitations, isLoading: loadingInvitations, error: invitationsError } = useQuery({
    queryKey: ['org-invitations', orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/orgs/${orgId}/invitations/pending`);
      return (response.data ?? []) as Invitation[];
    },
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await apiClient.post(`/orgs/${orgId}/invitations`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
      toast({
        title: 'Invitation sent',
        description: `An invitation email has been sent to ${inviteEmail}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to send invitation',
        variant: 'destructive',
      });
    },
  });

  // Resend invitation mutation
  const resendMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await apiClient.post(`/orgs/${orgId}/invitations/${invitationId}/resend`, {});
    },
    onSuccess: () => {
      toast({ title: 'Invitation resent' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to resend invitation',
        variant: 'destructive',
      });
    },
  });

  // Revoke invitation mutation
  const revokeMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await apiClient.delete(`/orgs/${orgId}/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] });
      setRevokeInvitationId(null);
      toast({ title: 'Invitation revoked' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to revoke invitation',
        variant: 'destructive',
      });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/orgs/${orgId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      setRemoveMemberId(null);
      toast({ title: 'Member removed' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to remove member',
        variant: 'destructive',
      });
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiClient.patch(`/orgs/${orgId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      toast({ title: 'Role updated' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update role',
        variant: 'destructive',
      });
    },
  });

  if (loadingMembers || loadingInvitations) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (membersError || invitationsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Users className="h-16 w-16 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-semibold">Failed to load team data</h2>
        <p className="text-muted-foreground">
          {(membersError as Error)?.message || (invitationsError as Error)?.message || 'An error occurred'}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Manage organization members and invitations"
        actions={
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation email to add a new member to your organization.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin - Full access except billing</SelectItem>
                      <SelectItem value="MEMBER">Member - Manage clusters</SelectItem>
                      <SelectItem value="READONLY">Read Only - View only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members ({members?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members && members.length > 0 ? (
            <div className="divide-y">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      {member.role === 'OWNER' ? (
                        <Crown className="h-5 w-5 text-yellow-500" />
                      ) : (
                        <span className="text-sm font-medium">
                          {member.userId.name 
                            ? member.userId.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                            : member.userId.email?.[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-medium">
                        {member.userId.name || member.userId.email}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {member.userId.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={roleColors[member.role]}>
                      {roleLabels[member.role]}
                    </Badge>
                    
                    {member.role !== 'OWNER' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId.id, role: 'ADMIN' })}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            Make Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId.id, role: 'MEMBER' })}
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Make Member
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId.id, role: 'READONLY' })}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            Make Read Only
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoveMemberId(member.userId.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No members yet</p>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending Invitations ({invitations?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invitations && invitations.length > 0 ? (
            <div className="divide-y">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium">{invitation.email}</div>
                      <div className="text-sm text-muted-foreground">
                        Invited {new Date(invitation.createdAt).toLocaleDateString()} •
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={roleColors[invitation.role]}>
                      {roleLabels[invitation.role]}
                    </Badge>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resendMutation.mutate(invitation.id)}
                      disabled={resendMutation.isPending}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setRevokeInvitationId(invitation.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No pending invitations</p>
          )}
        </CardContent>
      </Card>

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        open={!!removeMemberId}
        onClose={() => setRemoveMemberId(null)}
        onConfirm={() => removeMemberId && removeMemberMutation.mutate(removeMemberId)}
        title="Remove Member"
        description="Are you sure you want to remove this member from the organization? They will lose access to all projects and clusters."
        confirmText="Remove Member"
        isDestructive
        isLoading={removeMemberMutation.isPending}
      />

      {/* Revoke Invitation Confirmation */}
      <ConfirmDialog
        open={!!revokeInvitationId}
        onClose={() => setRevokeInvitationId(null)}
        onConfirm={() => revokeInvitationId && revokeMutation.mutate(revokeInvitationId)}
        title="Revoke Invitation"
        description="Are you sure you want to revoke this invitation? The link will no longer work."
        confirmText="Revoke"
        isDestructive
        isLoading={revokeMutation.isPending}
      />
    </div>
  );
}





