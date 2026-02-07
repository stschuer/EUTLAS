import { GlobalExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockRequest = {
      url: '/api/v1/test',
      headers: {},
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any as ArgumentsHost;
  });

  // ==================== HttpException with string response ====================

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'Not Found',
        }),
        path: '/api/v1/test',
      }),
    );
  });

  // ==================== HttpException with object response ====================

  it('should handle HttpException with object response containing code and details', () => {
    const exception = new HttpException(
      {
        code: 'CLUSTER_EXISTS',
        message: 'Cluster already exists',
        details: { clusterId: '123' },
      },
      HttpStatus.CONFLICT,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error.code).toBe('CLUSTER_EXISTS');
    expect(jsonCall.error.message).toBe('Cluster already exists');
    expect(jsonCall.error.details).toEqual({ clusterId: '123' });
  });

  it('should handle HttpException with object response but no code (falls back to status-based code)', () => {
    const exception = new HttpException(
      { message: 'Forbidden resource' },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error.code).toBe('FORBIDDEN');
    expect(jsonCall.error.message).toBe('Forbidden resource');
  });

  // ==================== Generic Error (non-HTTP) ====================

  it('should handle generic Error with 500 status', () => {
    const exception = new Error('Something broke');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error.code).toBe('INTERNAL_ERROR');
    expect(jsonCall.error.message).toBe('Something broke');
  });

  // ==================== Unknown exception ====================

  it('should handle unknown exception type with defaults', () => {
    filter.catch('some string error', mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error.code).toBe('INTERNAL_ERROR');
    expect(jsonCall.error.message).toBe('An unexpected error occurred');
  });

  it('should handle null/undefined exception', () => {
    filter.catch(null, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
        }),
      }),
    );
  });

  // ==================== Request ID inclusion ====================

  it('should include requestId when x-request-id header is present', () => {
    mockRequest.headers['x-request-id'] = 'req-abc-123';

    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.requestId).toBe('req-abc-123');
  });

  it('should omit requestId when x-request-id header is missing', () => {
    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.requestId).toBeUndefined();
  });

  // ==================== Status code to error code mapping ====================

  it('should map all known status codes correctly', () => {
    const mappings: Array<[number, string]> = [
      [400, 'BAD_REQUEST'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [409, 'CONFLICT'],
      [422, 'VALIDATION_ERROR'],
      [429, 'TOO_MANY_REQUESTS'],
      [500, 'INTERNAL_ERROR'],
      [503, 'SERVICE_UNAVAILABLE'],
    ];

    for (const [status, expectedCode] of mappings) {
      mockResponse.status.mockClear();
      mockResponse.json.mockClear();

      const exception = new HttpException({ message: 'test' }, status);
      filter.catch(exception, mockHost);

      const jsonCall = mockResponse.json.mock.calls[0][0];
      expect(jsonCall.error.code).toBe(expectedCode);
    }
  });

  it('should return UNKNOWN_ERROR for unmapped status codes', () => {
    const exception = new HttpException({ message: 'test' }, 418);
    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error.code).toBe('UNKNOWN_ERROR');
  });

  // ==================== Response structure ====================

  it('should always include timestamp and path', () => {
    const exception = new HttpException('test', HttpStatus.OK);
    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.timestamp).toBeDefined();
    expect(new Date(jsonCall.timestamp).getTime()).not.toBeNaN();
    expect(jsonCall.path).toBe('/api/v1/test');
  });

  it('should not include details when not provided', () => {
    const exception = new HttpException(
      { message: 'No details here' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error.details).toBeUndefined();
  });
});
