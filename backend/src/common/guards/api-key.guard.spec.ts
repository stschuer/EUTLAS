import { ApiKeyGuard } from './api-key.guard';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let reflector: Reflector;
  let mockApiKeysService: any;

  const createMockContext = (headers: Record<string, string> = {}, ip?: string): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          ip: ip || '127.0.0.1',
          connection: { remoteAddress: '127.0.0.1' },
          apiKey: undefined,
          orgId: undefined,
        }),
      }),
    } as any;
  };

  beforeEach(() => {
    reflector = new Reflector();
    mockApiKeysService = {
      validateKey: jest.fn(),
      hasScope: jest.fn(),
    };
    guard = new ApiKeyGuard(reflector, mockApiKeysService);
  });

  // ==================== Missing API key header ====================

  it('should return false when no x-api-key header is present', async () => {
    const context = createMockContext({});
    const result = await guard.canActivate(context);
    expect(result).toBe(false);
  });

  // ==================== Invalid format ====================

  it('should throw UnauthorizedException for API key without colon separator', async () => {
    const context = createMockContext({ 'x-api-key': 'invalidkey' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for API key with multiple colons', async () => {
    const context = createMockContext({ 'x-api-key': 'pk:sk:extra' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  // ==================== Invalid key ====================

  it('should throw UnauthorizedException when key validation fails', async () => {
    mockApiKeysService.validateKey.mockResolvedValue({
      valid: false,
      error: 'API key expired',
    });

    const context = createMockContext({ 'x-api-key': 'pk123:sk456' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should include error message from validation result', async () => {
    mockApiKeysService.validateKey.mockResolvedValue({
      valid: false,
      error: 'Key revoked',
    });

    const context = createMockContext({ 'x-api-key': 'pk123:sk456' });

    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const response = err.getResponse();
      expect(response.message).toBe('Key revoked');
    }
  });

  // ==================== Valid key, no scope required ====================

  it('should allow access with valid key and no scope requirement', async () => {
    mockApiKeysService.validateKey.mockResolvedValue({
      valid: true,
      apiKey: { orgId: 'org-123', scopes: ['read'] },
    });
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);

    const context = createMockContext({ 'x-api-key': 'pk123:sk456' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockApiKeysService.validateKey).toHaveBeenCalledWith('pk123', 'sk456', '127.0.0.1');
  });

  // ==================== Scope checking ====================

  it('should throw UnauthorizedException when required scope is not met', async () => {
    mockApiKeysService.validateKey.mockResolvedValue({
      valid: true,
      apiKey: { orgId: 'org-123', scopes: ['read'] },
    });
    mockApiKeysService.hasScope.mockReturnValue(false);
    jest.spyOn(reflector, 'get').mockReturnValue('write');

    const context = createMockContext({ 'x-api-key': 'pk123:sk456' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow access when required scope is met', async () => {
    const apiKey = { orgId: 'org-123', scopes: ['read', 'write'] };
    mockApiKeysService.validateKey.mockResolvedValue({
      valid: true,
      apiKey,
    });
    mockApiKeysService.hasScope.mockReturnValue(true);
    jest.spyOn(reflector, 'get').mockReturnValue('write');

    const context = createMockContext({ 'x-api-key': 'pk123:sk456' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockApiKeysService.hasScope).toHaveBeenCalledWith(apiKey, 'write');
  });

  // ==================== Request mutation ====================

  it('should attach apiKey and orgId to request on success', async () => {
    const apiKey = { orgId: { toString: () => 'org-456' }, scopes: ['read'] };
    mockApiKeysService.validateKey.mockResolvedValue({
      valid: true,
      apiKey,
    });
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);

    const requestObj: any = {
      headers: { 'x-api-key': 'pk123:sk456' },
      ip: '10.0.0.1',
      connection: { remoteAddress: '10.0.0.1' },
    };

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => requestObj,
      }),
    } as any;

    await guard.canActivate(context);

    expect(requestObj.apiKey).toBe(apiKey);
    expect(requestObj.orgId).toBe('org-456');
  });
});
