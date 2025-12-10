import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, body } = request;
    const requestId = request.headers['x-request-id'] || 'no-request-id';
    const userAgent = request.headers['user-agent'] || 'unknown';
    const userId = (request as any).user?.userId || 'anonymous';

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(
            JSON.stringify({
              type: 'http_request',
              method,
              url,
              statusCode,
              duration,
              userId,
              requestId,
              userAgent,
            }),
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.error(
            JSON.stringify({
              type: 'http_request',
              method,
              url,
              statusCode,
              duration,
              userId,
              requestId,
              userAgent,
              error: error.message,
            }),
          );
        },
      }),
    );
  }
}


