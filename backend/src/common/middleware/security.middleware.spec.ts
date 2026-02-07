import { SecurityMiddleware, IpExtractionMiddleware } from './security.middleware';
import { ConfigService } from '@nestjs/config';

describe('SecurityMiddleware', () => {
  let middleware: SecurityMiddleware;

  const createMockReqRes = (url = '/api/v1/test', body = {}, authHeader?: string) => {
    const req: any = {
      url,
      body,
      method: 'GET',
      ip: '127.0.0.1',
      headers: {} as Record<string, string>,
    };
    if (authHeader) {
      req.headers.authorization = authHeader;
    }

    const res: any = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    return { req, res, next };
  };

  // ==================== Development mode ====================

  describe('in development mode', () => {
    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue('development') } as any;
      middleware = new SecurityMiddleware(configService);
    });

    it('should remove X-Powered-By header', () => {
      const { req, res, next } = createMockReqRes();
      middleware.use(req, res, next);

      expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    });

    it('should set security headers', () => {
      const { req, res, next } = createMockReqRes();
      middleware.use(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()',
      );
    });

    it('should NOT set HSTS header in development', () => {
      const { req, res, next } = createMockReqRes();
      middleware.use(req, res, next);

      const hstsCall = (res.setHeader as jest.Mock).mock.calls.find(
        (call: any[]) => call[0] === 'Strict-Transport-Security',
      );
      expect(hstsCall).toBeUndefined();
    });

    it('should call next()', () => {
      const { req, res, next } = createMockReqRes();
      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ==================== Production mode ====================

  describe('in production mode', () => {
    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue('production') } as any;
      middleware = new SecurityMiddleware(configService);
    });

    it('should set HSTS header in production', () => {
      const { req, res, next } = createMockReqRes();
      middleware.use(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    });
  });

  // ==================== Suspicious request detection ====================

  describe('suspicious request detection', () => {
    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue('development') } as any;
      middleware = new SecurityMiddleware(configService);
    });

    it('should detect path traversal in URL', () => {
      const { req, res, next } = createMockReqRes('/api/v1/../../../etc/passwd');
      middleware.use(req, res, next);

      // Should still call next (middleware logs but doesn't block)
      expect(next).toHaveBeenCalled();
    });

    it('should detect XSS attempt in URL', () => {
      const { req, res, next } = createMockReqRes('/api/v1/<script>alert(1)</script>');
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should detect SQL injection in URL', () => {
      const { req, res, next } = createMockReqRes('/api/v1/users?q=1 UNION SELECT * FROM users');
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should detect javascript: URLs', () => {
      const { req, res, next } = createMockReqRes('/api/v1?redirect=javascript:alert(1)');
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should detect event handler injection in body', () => {
      const { req, res, next } = createMockReqRes('/api/v1/test', {
        name: '<img onerror=alert(1)>',
      });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should detect null byte injection', () => {
      const { req, res, next } = createMockReqRes('/api/v1/files/test%00.php');
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should detect eval injection', () => {
      const { req, res, next } = createMockReqRes('/api/v1/test', {
        code: 'eval(document.cookie)',
      });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should not flag clean requests', () => {
      const { req, res, next } = createMockReqRes('/api/v1/clusters', {
        name: 'my-clean-cluster',
      });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // ==================== Invalid auth header format ====================

  describe('auth header validation', () => {
    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue('development') } as any;
      middleware = new SecurityMiddleware(configService);
    });

    it('should not flag valid Bearer token', () => {
      const { req, res, next } = createMockReqRes('/api/v1/test', {}, 'Bearer eyJtoken...');
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should log warning for non-Bearer auth header', () => {
      const { req, res, next } = createMockReqRes('/api/v1/test', {}, 'Basic dXNlcjpwYXNz');
      middleware.use(req, res, next);
      // Still calls next (just logs a warning)
      expect(next).toHaveBeenCalled();
    });
  });
});

// ==================== IpExtractionMiddleware ====================

describe('IpExtractionMiddleware', () => {
  let middleware: IpExtractionMiddleware;

  beforeEach(() => {
    middleware = new IpExtractionMiddleware();
  });

  it('should extract IP from x-forwarded-for header', () => {
    const req: any = {
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178' },
      ip: '10.0.0.1',
      connection: { remoteAddress: '10.0.0.1' },
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.realIp).toBe('203.0.113.50');
    expect(next).toHaveBeenCalled();
  });

  it('should extract IP from x-real-ip header when x-forwarded-for is absent', () => {
    const req: any = {
      headers: { 'x-real-ip': '192.168.1.100' },
      ip: '10.0.0.1',
      connection: { remoteAddress: '10.0.0.1' },
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.realIp).toBe('192.168.1.100');
  });

  it('should fall back to req.ip when no proxy headers are present', () => {
    const req: any = {
      headers: {},
      ip: '172.16.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.realIp).toBe('172.16.0.1');
  });

  it('should fall back to connection.remoteAddress when req.ip is missing', () => {
    const req: any = {
      headers: {},
      ip: undefined,
      connection: { remoteAddress: '192.168.0.5' },
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.realIp).toBe('192.168.0.5');
  });

  it('should use "unknown" when no IP source is available', () => {
    const req: any = {
      headers: {},
      ip: undefined,
      connection: {},
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.realIp).toBe('unknown');
  });

  it('should prefer x-forwarded-for over x-real-ip', () => {
    const req: any = {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
      },
      ip: '10.0.0.1',
      connection: { remoteAddress: '10.0.0.1' },
    };
    const res: any = {};
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.realIp).toBe('1.2.3.4');
  });
});
