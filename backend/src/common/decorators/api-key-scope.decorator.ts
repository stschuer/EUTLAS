import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '../../modules/api-keys/schemas/api-key.schema';
import { API_KEY_SCOPE } from '../guards/api-key.guard';

export const RequireApiKeyScope = (scope: ApiKeyScope) =>
  SetMetadata(API_KEY_SCOPE, scope);





