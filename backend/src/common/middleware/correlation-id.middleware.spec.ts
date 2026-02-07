import { CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should use existing x-request-id from request headers', () => {
    const req: any = {
      headers: { 'x-request-id': 'existing-id-123' },
    };
    const res: any = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.headers['x-request-id']).toBe('existing-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'existing-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('should generate a UUID when no x-request-id header exists', () => {
    const req: any = {
      headers: {},
    };
    const res: any = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(req, res, next);

    // Should have generated a UUID
    const generatedId = req.headers['x-request-id'];
    expect(generatedId).toBeDefined();
    expect(typeof generatedId).toBe('string');
    // UUID v4 pattern
    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', generatedId);
    expect(next).toHaveBeenCalled();
  });

  it('should set the correlation ID on both request and response', () => {
    const req: any = {
      headers: { 'x-request-id': 'shared-id' },
    };
    const res: any = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.headers['x-request-id']).toBe('shared-id');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'shared-id');
  });

  it('should always call next()', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
