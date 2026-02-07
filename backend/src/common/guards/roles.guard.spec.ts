import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockContext = (orgRole?: string): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ orgRole }),
      }),
    } as any as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  // ==================== No required roles ====================

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when required roles array is null', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const context = createMockContext('MEMBER');

    expect(guard.canActivate(context)).toBe(true);
  });

  // ==================== Missing user role ====================

  it('should throw ForbiddenException when user has no org role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER']);
    const context = createMockContext(); // no orgRole

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('No organization role found');
  });

  // ==================== Role hierarchy ====================

  describe('role hierarchy checks', () => {
    it('OWNER should satisfy OWNER requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['OWNER']);
      const context = createMockContext('OWNER');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('OWNER should satisfy ADMIN requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext('OWNER');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('OWNER should satisfy MEMBER requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER']);
      const context = createMockContext('OWNER');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('OWNER should satisfy READONLY requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['READONLY']);
      const context = createMockContext('OWNER');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('ADMIN should satisfy ADMIN requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext('ADMIN');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('ADMIN should satisfy MEMBER requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER']);
      const context = createMockContext('ADMIN');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('ADMIN should NOT satisfy OWNER requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['OWNER']);
      const context = createMockContext('ADMIN');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('MEMBER should satisfy MEMBER requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER']);
      const context = createMockContext('MEMBER');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('MEMBER should NOT satisfy ADMIN requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext('MEMBER');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('READONLY should only satisfy READONLY requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['READONLY']);
      const context = createMockContext('READONLY');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('READONLY should NOT satisfy MEMBER requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER']);
      const context = createMockContext('READONLY');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  // ==================== Multiple required roles (OR logic) ====================

  describe('multiple required roles', () => {
    it('should allow if user matches any required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'OWNER']);
      const context = createMockContext('ADMIN');

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow OWNER when ADMIN or MEMBER is required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'MEMBER']);
      const context = createMockContext('OWNER');

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject READONLY when ADMIN or MEMBER is required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'MEMBER']);
      const context = createMockContext('READONLY');

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
