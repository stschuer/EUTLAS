export interface User {
  id: string;
  email: string;
  name?: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends User {
  orgs: UserOrgMembership[];
}

export interface UserOrgMembership {
  orgId: string;
  orgName: string;
  role: OrgRole;
}

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';




