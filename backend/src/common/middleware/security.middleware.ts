import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * Security middleware that adds security headers and logging.
 */
@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // HSTS for production
    if (this.isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    // Log suspicious requests
    this.logSuspiciousRequest(req);

    next();
  }

  private logSuspiciousRequest(req: Request): void {
    const suspiciousPatterns = [
      /\.\.\//,           // Path traversal
      /<script/i,         // XSS attempt
      /UNION\s+SELECT/i,  // SQL injection
      /javascript:/i,     // JavaScript URL
      /on\w+=/i,          // Event handler injection
      /%00/,              // Null byte injection
      /eval\(/i,          // Eval injection
    ];

    const url = req.url || '';
    const body = JSON.stringify(req.body || {});
    const combined = url + body;

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(combined)) {
        this.logger.warn(
          `Suspicious request detected: ${req.method} ${req.url} from ${req.ip}`,
          { pattern: pattern.toString() },
        );
        break;
      }
    }

    // Log failed authentication attempts
    const authHeader = req.headers.authorization;
    if (authHeader && !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid auth header format from ${req.ip}: ${authHeader.substring(0, 20)}...`,
      );
    }
  }
}

/**
 * IP extraction middleware for accurate rate limiting.
 * Stores real IP in req['realIp'] since req.ip is read-only.
 */
@Injectable()
export class IpExtractionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Get real IP from proxy headers
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    
    let clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    if (typeof forwardedFor === 'string') {
      clientIp = forwardedFor.split(',')[0].trim();
    } else if (typeof realIp === 'string') {
      clientIp = realIp;
    }

    // Store real IP in a custom property
    (req as any).realIp = clientIp;

    next();
  }
}

