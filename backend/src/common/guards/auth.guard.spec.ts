import { JwtAuthGuard } from './auth.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  const createMockContext = (requestOverrides?: Record<string, any>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ headers: {}, ...requestOverrides }),
        getResponse: jest.fn().mockReturnValue({}),
      }),
      getType: jest.fn().mockReturnValue('http'),
      getArgs: jest.fn().mockReturnValue([{ headers: {}, ...requestOverrides }, {}, undefined, undefined]),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as any);

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  // ==================== Public routes ====================

  it('should allow access to public routes (returns true immediately)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const context = createMockContext();

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should check IS_PUBLIC_KEY metadata from handler and class', async () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const context = createMockContext();

    await guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  // ==================== handleRequest ====================

  describe('handleRequest', () => {
    it('should return user when user is present and no error', () => {
      const user = { userId: 'user-123', email: 'test@example.com' };
      const result = guard.handleRequest(null, user, null);
      expect(result).toBe(user);
    });

    it('should throw UnauthorizedException when no user and no error', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.handleRequest(null, null, null)).toThrow(
        'Authentication required',
      );
    });

    it('should throw the original error if one is provided', () => {
      const error = new Error('Token expired');
      expect(() => guard.handleRequest(error, null, null)).toThrow('Token expired');
    });

    it('should throw the error even if user is provided (error takes precedence)', () => {
      const error = new Error('Something went wrong');
      const user = { userId: 'user-123' };
      expect(() => guard.handleRequest(error, user, null)).toThrow(
        'Something went wrong',
      );
    });

    it('should return user when err is undefined/null/false and user exists', () => {
      const user = { userId: 'u1' };
      expect(guard.handleRequest(undefined, user, null)).toBe(user);
      expect(guard.handleRequest(null, user, null)).toBe(user);
      expect(guard.handleRequest(false, user, null)).toBe(user);
    });

    it('should throw UnauthorizedException for undefined user with no error', () => {
      expect(() => guard.handleRequest(null, undefined, null)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for false user with no error', () => {
      expect(() => guard.handleRequest(null, false, null)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
