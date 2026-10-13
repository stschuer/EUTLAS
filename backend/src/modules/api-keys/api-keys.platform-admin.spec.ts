import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService platform:admin keys', () => {
  const adminId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const users: Record<string, any> = {
    [adminId.toString()]: { isGlobalAdmin: true, isActive: true },
    [userId.toString()]: { isGlobalAdmin: false, isActive: true },
  };
  const connection: any = {
    collection: () => ({ findOne: async ({ _id }: any) => users[_id.toString()] ?? null }),
  };
  const ApiKeyModel: any = function (this: any, data: any) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  };
  let service: ApiKeysService;

  beforeEach(() => {
    service = new ApiKeysService(ApiKeyModel, { createEvent: jest.fn() } as any, connection);
  });

  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  it('lets an active global admin create a short-lived platform key', async () => {
    const { apiKey } = await service.create('org', adminId.toString(), {
      name: 'admin-mcp',
      scopes: ['platform:admin'],
      expiresAt: inDays(7),
    } as any);
    expect(apiKey.scopes).toEqual(['platform:admin']);
  });

  it('refuses platform keys for non-admins', async () => {
    await expect(
      service.create('org', userId.toString(), { name: 'x', scopes: ['platform:admin'], expiresAt: inDays(7) } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an expiry within 30 days', async () => {
    await expect(
      service.create('org', adminId.toString(), { name: 'x', scopes: ['platform:admin'] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('org', adminId.toString(), { name: 'x', scopes: ['platform:admin'], expiresAt: inDays(60) } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('honours a platform key only while its creator is still a global admin', async () => {
    const key: any = { scopes: ['platform:admin'], createdBy: adminId };
    expect(await service.isPlatformAdminKey(key)).toBe(true);
    users[adminId.toString()].isGlobalAdmin = false;
    expect(await service.isPlatformAdminKey(key)).toBe(false);
    users[adminId.toString()].isGlobalAdmin = true;
    expect(await service.isPlatformAdminKey({ scopes: ['admin'], createdBy: adminId } as any)).toBe(false);
  });
});
