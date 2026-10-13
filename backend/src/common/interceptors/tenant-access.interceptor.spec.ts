import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenantAccessInterceptor } from './tenant-access.interceptor';
import { RequestContext } from '../request-context';
import { OrgsService } from '../../modules/orgs/orgs.service';

describe('TenantAccessInterceptor', () => {
  const orgA = new Types.ObjectId();
  const orgB = new Types.ObjectId();
  const projectA = new Types.ObjectId();
  const projectB = new Types.ObjectId();
  const clusterA = new Types.ObjectId();
  const clusterB = new Types.ObjectId();
  const userA = new Types.ObjectId().toString();

  const docs: Record<string, any[]> = {
    clusters: [
      { _id: clusterA, projectId: projectA, orgId: orgA },
      { _id: clusterB, projectId: projectB, orgId: orgB },
    ],
    projects: [
      { _id: projectA, orgId: orgA },
      { _id: projectB, orgId: orgB },
    ],
  };
  const connection: any = {
    collection: (name: string) => ({
      findOne: async ({ _id }: any) => docs[name].find((d) => d._id.equals(_id)) ?? null,
    }),
  };
  // userA is a member of org A only.
  const memberModel: any = {
    findOne: ({ orgId, userId }: any) => ({
      exec: async () => (orgId === orgA.toString() && userId === userA ? { role: 'MEMBER' } : null),
    }),
  };
  let interceptor: TenantAccessInterceptor;

  beforeEach(() => {
    const orgs = Object.create(OrgsService.prototype);
    orgs.getUserRole = async (orgId: string, userId: string) =>
      (await memberModel.findOne({ orgId, userId }).exec())?.role ?? null;
    interceptor = new TenantAccessInterceptor(connection, orgs);
  });

  const req = (params: Record<string, string>, extra: Record<string, any> = {}) => ({
    params,
    user: { userId: userA },
    ...extra,
  });

  it('lets a member access their own cluster', async () => {
    const request: any = req({ projectId: projectA.toString(), clusterId: clusterA.toString() });
    await expect(interceptor.authorize(request)).resolves.toBeUndefined();
    expect(request.orgRole).toBe('MEMBER');
  });

  it("rejects another tenant's cluster", async () => {
    await expect(
      interceptor.authorize(req({ projectId: projectB.toString(), clusterId: clusterB.toString() })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a foreign cluster smuggled under the caller’s own project', async () => {
    await expect(
      interceptor.authorize(req({ projectId: projectA.toString(), clusterId: clusterB.toString() })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a foreign project under the caller’s own org', async () => {
    await expect(
      interceptor.authorize(req({ orgId: orgA.toString(), projectId: projectB.toString() })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an ordinary API key outside its own org even if its creator is a member", async () => {
    await expect(
      interceptor.authorize(req({ clusterId: clusterA.toString() }, { apiKey: { orgId: orgB } })),
    ).rejects.toThrow(/different organization/);
  });

  it('lets a platform-admin key into any org', async () => {
    const request: any = req({ clusterId: clusterB.toString() }, { apiKey: { orgId: orgA }, platformAdmin: true });
    await RequestContext.run(async () => {
      RequestContext.markPlatformAdmin();
      await expect(interceptor.authorize(request)).resolves.toBeUndefined();
    });
    expect(request.orgRole).toBe('OWNER');
  });

  it('ignores public routes and routes without tenant params', async () => {
    await expect(interceptor.authorize({ params: { clusterId: clusterB.toString() } })).resolves.toBeUndefined();
    await expect(interceptor.authorize(req({}))).resolves.toBeUndefined();
  });

  it('returns 404 for malformed ids', async () => {
    await expect(interceptor.authorize(req({ clusterId: 'not-an-id' }))).rejects.toBeInstanceOf(NotFoundException);
  });
});
