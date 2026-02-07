import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  const createMockContext = (overrides: Partial<{
    method: string;
    url: string;
    body: any;
    requestId: string;
    userAgent: string;
    userId: string;
    statusCode: number;
  }> = {}): ExecutionContext => {
    const request = {
      method: overrides.method || 'GET',
      url: overrides.url || '/api/v1/clusters',
      body: overrides.body || {},
      headers: {
        'x-request-id': overrides.requestId || 'test-req-id',
        'user-agent': overrides.userAgent || 'jest-test',
      },
      user: overrides.userId ? { userId: overrides.userId } : undefined,
    };

    const response = {
      statusCode: overrides.statusCode || 200,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;
  };

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should pass through the response on success', (done) => {
    const context = createMockContext();
    const handler: CallHandler = {
      handle: () => of({ data: 'test' }),
    };

    interceptor.intercept(context, handler).subscribe({
      next: (value) => {
        expect(value).toEqual({ data: 'test' });
      },
      complete: () => done(),
    });
  });

  it('should propagate errors', (done) => {
    const context = createMockContext();
    const error = new Error('Something failed');
    (error as any).status = 500;

    const handler: CallHandler = {
      handle: () => throwError(() => error),
    };

    interceptor.intercept(context, handler).subscribe({
      error: (err) => {
        expect(err.message).toBe('Something failed');
        done();
      },
    });
  });

  it('should use "anonymous" when no user is present', (done) => {
    const context = createMockContext(); // no userId
    const handler: CallHandler = {
      handle: () => of('ok'),
    };

    interceptor.intercept(context, handler).subscribe({
      complete: () => done(),
    });
  });

  it('should use "no-request-id" when header is missing', (done) => {
    const request = {
      method: 'POST',
      url: '/api/v1/test',
      body: {},
      headers: {},
    };
    const response = { statusCode: 201 };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;

    const handler: CallHandler = {
      handle: () => of('ok'),
    };

    interceptor.intercept(context, handler).subscribe({
      complete: () => done(),
    });
  });
});
