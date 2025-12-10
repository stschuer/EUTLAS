import { OrgRole } from './user';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  name?: string;
  role: OrgRole;
  joinedAt: Date;
}

export interface OrgInvitation {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateOrgRequest {
  name: string;
}

export interface UpdateOrgRequest {
  name?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: OrgRole;
}


