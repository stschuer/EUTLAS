import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { from, Observable, switchMap } from 'rxjs';
import { OrgsService } from '../../modules/orgs/orgs.service';
import { GlobalAdminGuard } from '../../modules/admin/guards/global-admin.guard';

/**
 * Tenant isolation for every authenticated route with :orgId, :projectId or
 * :clusterId. Many controllers trusted these path params without checking
 * membership, so any signed-up user could read or change another tenant's
 * clusters (backup policy, migrations, log forwarding, audit log, …).
 *
 * Runs as an interceptor because interceptors execute after the controllers'
 * auth guards have populated request.user. It verifies that the IDs belong
 * together (cluster → project → org), that the caller is a member of the org
 * (OrgsService.checkAccess, which also honours platform-admin keys), and that
 * an ordinary API key only acts within its own org. Role requirements stay
 * with the individual controllers.
 */
@Injectable()
export class TenantAccessInterceptor implements NestInterceptor {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly orgsService: OrgsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    // Global-admin routes (e.g. /admin/tenants/:tenantId) have their own guard.
    const guards = [
      ...(Reflect.getMetadata(GUARDS_METADATA, context.getClass()) ?? []),
      ...(Reflect.getMetadata(GUARDS_METADATA, context.getHandler()) ?? []),
    ];
    if (guards.includes(GlobalAdminGuard)) return next.handle();
    const request = context.switchToHttp().getRequest();
    return from(this.authorize(request)).pipe(switchMap(() => next.handle()));
  }

  async authorize(request: any): Promise<void> {
    const params = request.params || {};
    const { orgId: orgParam, projectId: projectParam, clusterId: clusterParam } = params;
    if (!orgParam && !projectParam && !clusterParam) return;
    // Public routes have no user.
    if (!request.user) return;

    for (const [name, value] of Object.entries({ orgParam, projectParam, clusterParam })) {
      if (value !== undefined && !Types.ObjectId.isValid(value)) {
        throw new NotFoundException(`Invalid ${name.replace('Param', 'Id')}`);
      }
    }

    let orgId: string | undefined = orgParam;
    let projectId: string | undefined = projectParam;

    if (clusterParam) {
      const cluster = await this.connection
        .collection('clusters')
        .findOne({ _id: new Types.ObjectId(clusterParam) }, { projection: { projectId: 1, orgId: 1 } });
      if (!cluster) throw new NotFoundException('Cluster not found');
      if (projectId && cluster.projectId?.toString() !== projectId) throw new NotFoundException('Cluster not found');
      if (orgId && cluster.orgId?.toString() !== orgId) throw new NotFoundException('Cluster not found');
      projectId = cluster.projectId?.toString();
      orgId = cluster.orgId?.toString();
    }

    if (projectId) {
      const project = await this.connection
        .collection('projects')
        .findOne({ _id: new Types.ObjectId(projectId) }, { projection: { orgId: 1 } });
      if (!project) throw new NotFoundException('Project not found');
      if (orgId && project.orgId?.toString() !== orgId) throw new NotFoundException('Project not found');
      orgId = project.orgId?.toString();
    }

    if (!orgId) throw new NotFoundException('Organization not found');

    if (request.apiKey && !request.platformAdmin && request.apiKey.orgId?.toString() !== orgId) {
      throw new ForbiddenException({
        code: 'API_KEY_WRONG_ORG',
        message: 'This API key belongs to a different organization',
      });
    }

    const userId = request.user.userId ?? request.user.sub;
    request.orgRole = await this.orgsService.checkAccess(orgId, userId);
  }
}
