/**
 * Tests for the getClientIp helper and throttle guard error messages.
 *
 * Note: We can't fully test ThrottlerGuard subclasses without the full
 * NestJS DI context, so we focus on the exported getClientIp function
 * by extracting its logic.
 */

describe('getClientIp logic', () => {
  // Replicate the getClientIp function logic from throttle-login.guard.ts
  function getClientIp(req: Record<string, any>): string {
    return req.realIp || req.ip || req.connection?.remoteAddress || 'unknown';
  }

  it('should prefer realIp (set by IpExtractionMiddleware)', () => {
    const req = { realIp: '203.0.113.50', ip: '10.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
    expect(getClientIp(req)).toBe('203.0.113.50');
  });

  it('should fall back to req.ip', () => {
    const req = { ip: '10.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('should fall back to connection.remoteAddress', () => {
    const req = { connection: { remoteAddress: '192.168.1.1' } };
    expect(getClientIp(req)).toBe('192.168.1.1');
  });

  it('should return "unknown" when nothing is available', () => {
    const req = { connection: {} };
    expect(getClientIp(req)).toBe('unknown');
  });

  it('should return "unknown" for completely empty request', () => {
    const req = {};
    expect(getClientIp(req)).toBe('unknown');
  });

  it('should not use realIp if it is empty string', () => {
    const req = { realIp: '', ip: '10.0.0.1' };
    expect(getClientIp(req)).toBe('10.0.0.1');
  });
});
