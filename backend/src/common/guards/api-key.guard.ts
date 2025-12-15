import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { ApiKeyScope } from '../../modules/api-keys/schemas/api-key.schema';

export const API_KEY_SCOPE = 'apiKeyScope';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Get API key from header
    const apiKeyHeader = request.headers['x-api-key'];
    if (!apiKeyHeader) {
      return false; // Let other guards handle auth
    }

    // Parse API key (format: "pk:sk" or "publicKey:secretKey")
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
    const result = await this.apiKeysService.validateKey(publicKey, secretKey, clientIp);

    if (!result.valid) {
      throw new UnauthorizedException({
        code: 'API_KEY_INVALID',
        message: result.error || 'Invalid API key',
      });
    }

    // Check required scope
    const requiredScope = this.reflector.get<ApiKeyScope>(
      API_KEY_SCOPE,
      context.getHandler(),
    );

    if (requiredScope && !this.apiKeysService.hasScope(result.apiKey!, requiredScope)) {
      throw new UnauthorizedException({
        code: 'INSUFFICIENT_SCOPE',
        message: `API key does not have required scope: ${requiredScope}`,
      });
    }

    // Attach API key info to request
    request.apiKey = result.apiKey;
    request.orgId = result.apiKey!.orgId.toString();

    this.logger.debug(`API key ${publicKey} authenticated for org ${request.orgId}`);

    return true;
  }
}





