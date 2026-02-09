import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { ApiKeyScope } from '../../modules/api-keys/schemas/api-key.schema';
import { API_KEY_SCOPE } from './api-key.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private reflector: Reflector,
    @Optional() private apiKeysService?: ApiKeysService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Check for API key authentication first
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];

    if (apiKeyHeader && this.apiKeysService) {
      return this.authenticateWithApiKey(context, request, apiKeyHeader);
    }

    // Fall back to JWT authentication
    return super.canActivate(context) as Promise<boolean>;
  }

  private async authenticateWithApiKey(
    context: ExecutionContext,
    request: any,
    apiKeyHeader: string,
  ): Promise<boolean> {
    // Parse API key (format: "eutlas_pk_...:eutlas_sk_...")
    const parts = apiKeyHeader.split(':');
    if (parts.length !== 2) {
      throw new UnauthorizedException({
        code: 'INVALID_API_KEY_FORMAT',
        message: 'API key must be in format "publicKey:secretKey"',
      });
    }

    const [publicKey, secretKey] = parts;

    // Validate API key
    const clientIp = request.ip || request.connection?.remoteAddress;
    const result = await this.apiKeysService!.validateKey(publicKey, secretKey, clientIp);

    if (!result.valid) {
      throw new UnauthorizedException({
        code: 'API_KEY_INVALID',
        message: result.error || 'Invalid API key',
      });
    }

    // Check required scope if defined via @RequireApiKeyScope() decorator
    const requiredScope = this.reflector.get<ApiKeyScope>(
      API_KEY_SCOPE,
      context.getHandler(),
    );

    if (requiredScope && !this.apiKeysService!.hasScope(result.apiKey!, requiredScope)) {
      throw new UnauthorizedException({
        code: 'INSUFFICIENT_SCOPE',
        message: `API key does not have required scope: ${requiredScope}`,
      });
    }

    // Populate request.user for compatibility with @CurrentUser() decorator
    request.user = {
      userId: result.apiKey!.createdBy.toString(),
      email: `apikey:${result.apiKey!.name}`,
      verified: true,
    };

    // Also attach API key info for API-key-specific logic
    request.apiKey = result.apiKey;
    request.orgId = result.apiKey!.orgId.toString();

    this.logger.debug(`API key ${publicKey} authenticated for org ${request.orgId}`);

    return true;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
