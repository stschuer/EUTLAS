import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, createHash } from 'crypto';
import { ApiKey, ApiKeyDocument, ApiKeyScope } from './schemas/api-key.schema';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/create-api-key.dto';
import { EventsService } from '../events/events.service';

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKeyDocument;
  error?: string;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    private readonly eventsService: EventsService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    createDto: CreateApiKeyDto,
  ): Promise<{ apiKey: ApiKey; secretKey: string }> {
    // Generate keys
    const publicKey = this.generatePublicKey();
    const secretKey = this.generateSecretKey();
    const keyHash = this.hashKey(secretKey);

    // Default scopes if not provided
    const scopes = createDto.scopes || ['clusters:read', 'projects:read'];

    const apiKey = new this.apiKeyModel({
      orgId,
      name: createDto.name,
      description: createDto.description,
      publicKey,
      keyHash,
      scopes: scopes as ApiKeyScope[],
      allowedIps: createDto.allowedIps || [],
      expiresAt: createDto.expiresAt ? new Date(createDto.expiresAt) : undefined,
      createdBy: userId,
    });

    await apiKey.save();

    // Log event
    await this.eventsService.createEvent({
      orgId,
      type: 'USER_JOINED', // Reusing event type
      severity: 'info',
      message: `API key "${createDto.name}" created`,
      metadata: { apiKeyId: apiKey.id, name: createDto.name },
    });

    this.logger.log(`Created API key ${publicKey} for org ${orgId}`);

    // Return both the key and secret (secret is only shown once!)
    return {
      apiKey,
      secretKey,
    };
  }

  async findByOrg(orgId: string): Promise<ApiKey[]> {
    return this.apiKeyModel
      .find({ orgId })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(apiKeyId: string): Promise<ApiKeyDocument | null> {
    return this.apiKeyModel.findById(apiKeyId).exec();
  }

  async findByPublicKey(publicKey: string): Promise<ApiKeyDocument | null> {
    return this.apiKeyModel.findOne({ publicKey }).exec();
  }

  async update(apiKeyId: string, updateDto: UpdateApiKeyDto): Promise<ApiKey> {
    const apiKey = await this.findById(apiKeyId);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (updateDto.name !== undefined) apiKey.name = updateDto.name;
    if (updateDto.description !== undefined) apiKey.description = updateDto.description;
    if (updateDto.scopes !== undefined) apiKey.scopes = updateDto.scopes as ApiKeyScope[];
    if (updateDto.allowedIps !== undefined) apiKey.allowedIps = updateDto.allowedIps;
    if (updateDto.isActive !== undefined) apiKey.isActive = updateDto.isActive;

    await apiKey.save();
    return apiKey;
  }

  async delete(apiKeyId: string): Promise<void> {
    const apiKey = await this.findById(apiKeyId);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    await this.apiKeyModel.findByIdAndDelete(apiKeyId).exec();

    this.logger.log(`Deleted API key ${apiKey.publicKey}`);
  }

  async validateKey(publicKey: string, secretKey: string, clientIp?: string): Promise<ApiKeyValidationResult> {
    const apiKey = await this.findByPublicKey(publicKey);

    if (!apiKey) {
      return { valid: false, error: 'API key not found' };
    }

    if (!apiKey.isActive) {
      return { valid: false, error: 'API key is disabled' };
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return { valid: false, error: 'API key has expired' };
    }

    // Verify secret key hash
    const providedHash = this.hashKey(secretKey);
    if (providedHash !== apiKey.keyHash) {
      return { valid: false, error: 'Invalid secret key' };
    }

    // Check IP whitelist if configured
    if (apiKey.allowedIps.length > 0 && clientIp) {
      const isAllowed = this.isIpAllowed(clientIp, apiKey.allowedIps);
      if (!isAllowed) {
        return { valid: false, error: 'IP address not allowed' };
      }
    }

    // Update usage stats
    apiKey.lastUsedAt = new Date();
    apiKey.usageCount += 1;
    await apiKey.save();

    return { valid: true, apiKey };
  }

  hasScope(apiKey: ApiKeyDocument, requiredScope: ApiKeyScope): boolean {
    // Admin scope grants all access
    if (apiKey.scopes.includes('admin')) {
      return true;
    }
    return apiKey.scopes.includes(requiredScope);
  }

  private generatePublicKey(): string {
    const random = randomBytes(16).toString('hex');
    return `eutlas_pk_${random}`;
  }

  private generateSecretKey(): string {
    const random = randomBytes(32).toString('hex');
    return `eutlas_sk_${random}`;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    for (const allowed of allowedIps) {
      if (allowed.includes('/')) {
        // CIDR notation
        if (this.isIpInCidr(clientIp, allowed)) {
          return true;
        }
      } else {
        // Exact match
        if (clientIp === allowed) {
          return true;
        }
      }
    }
    return false;
  }

  private isIpInCidr(ip: string, cidr: string): boolean {
    const [network, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    
    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);
    
    return (ipNum & mask) === (networkNum & mask);
  }

  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }
}





