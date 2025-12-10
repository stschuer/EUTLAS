import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

/**
 * Helper function to get client IP from request
 */
function getClientIp(req: Record<string, any>): string {
  return req.realIp || req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Special rate limiter for login attempts.
 * More aggressive throttling than general API limits to prevent brute force attacks.
 */
@Injectable()
export class ThrottleLoginGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw new ThrottlerException(
          'Too many login attempts. Please try again later.',
        );
      }
      throw error;
    }
  }
}

/**
 * Rate limiter for password reset requests.
 * Prevents email enumeration and spam.
 */
@Injectable()
export class ThrottlePasswordResetGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw new ThrottlerException(
          'Too many password reset requests. Please wait before trying again.',
        );
      }
      throw error;
    }
  }
}

/**
 * Rate limiter for signup attempts.
 * Prevents mass account creation.
 */
@Injectable()
export class ThrottleSignupGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw new ThrottlerException(
          'Too many signup attempts from this IP. Please try again later.',
        );
      }
      throw error;
    }
  }
}

/**
 * Rate limiter for API key usage.
 */
@Injectable()
export class ThrottleApiKeyGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw new ThrottlerException(
          'API rate limit exceeded. Please reduce your request rate.',
        );
      }
      throw error;
    }
  }
}

