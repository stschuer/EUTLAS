import { SetMetadata } from '@nestjs/common';

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);




