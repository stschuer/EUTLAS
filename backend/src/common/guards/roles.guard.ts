import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, OrgRole } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRole = request.orgRole; // Set by OrgAccessGuard

    if (!userRole) {
      throw new ForbiddenException('No organization role found');
    }

    const hasRole = requiredRoles.some((role) => this.checkRole(userRole, role));
    
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private checkRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
    const roleHierarchy: Record<OrgRole, number> = {
      OWNER: 4,
      ADMIN: 3,
      MEMBER: 2,
      READONLY: 1,
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }
}





