import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { SsoConfig, SsoConfigDocument } from './schemas/sso-config.schema';
import { CreateSsoConfigDto, UpdateSsoConfigDto } from './dto/sso-config.dto';
import { UsersService } from '../users/users.service';
import { OrgsService } from '../orgs/orgs.service';
import { EventsService } from '../events/events.service';

export interface SsoUser {
  email: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  nameId?: string;
  provider: string;
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectModel(SsoConfig.name) private ssoConfigModel: Model<SsoConfigDocument>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly orgsService: OrgsService,
    private readonly eventsService: EventsService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

  // ==================== SSO Config CRUD ====================

  async create(orgId: string, userId: string, createDto: CreateSsoConfigDto): Promise<SsoConfig> {
    // Validate config based on type
    if (createDto.type === 'saml' && !createDto.saml) {
      throw new BadRequestException('SAML configuration is required for SAML type');
    }
    if (createDto.type === 'oidc' && !createDto.oidc) {
      throw new BadRequestException('OIDC configuration is required for OIDC type');
    }

    // Check for existing enabled config
    if (createDto.enabled) {
      const existingEnabled = await this.ssoConfigModel.findOne({
        orgId: new Types.ObjectId(orgId),
        enabled: true,
      }).exec();

      if (existingEnabled) {
        throw new ConflictException('Only one SSO configuration can be enabled at a time');
      }
    }

    const config = new this.ssoConfigModel({
      ...createDto,
      orgId: new Types.ObjectId(orgId),
      createdBy: new Types.ObjectId(userId),
    });

    await config.save();

    // Log event
    await this.eventsService.createEvent({
      orgId,
      type: 'SSO_CONFIG_CREATED' as any,
      severity: 'info',
      message: `SSO configuration "${createDto.name}" created (${createDto.type})`,
      metadata: { configId: config._id.toString(), type: createDto.type },
    });

    this.logger.log(`SSO config created: ${config._id} for org ${orgId}`);
    return config;
  }

  async findAllByOrg(orgId: string): Promise<SsoConfig[]> {
    return this.ssoConfigModel.find({ orgId: new Types.ObjectId(orgId) }).exec();
  }

  async findById(configId: string): Promise<SsoConfig> {
    const config = await this.ssoConfigModel.findById(configId).exec();
    if (!config) {
      throw new NotFoundException('SSO configuration not found');
    }
    return config;
  }

  async findEnabledByOrg(orgId: string): Promise<SsoConfig | null> {
    return this.ssoConfigModel.findOne({
      orgId: new Types.ObjectId(orgId),
      enabled: true,
    }).exec();
  }

  async findByEmailDomain(domain: string): Promise<SsoConfig | null> {
    return this.ssoConfigModel.findOne({
      emailDomains: domain.toLowerCase(),
      enabled: true,
    }).exec();
  }

  async update(configId: string, userId: string, updateDto: UpdateSsoConfigDto): Promise<SsoConfig> {
    const config = await this.findById(configId);

    // If enabling, disable other configs
    if (updateDto.enabled && !config.enabled) {
      await this.ssoConfigModel.updateMany(
        { orgId: config.orgId, enabled: true },
        { enabled: false },
      ).exec();
    }

    Object.assign(config, updateDto, { updatedBy: new Types.ObjectId(userId) });
    await (config as SsoConfigDocument).save();

    this.logger.log(`SSO config updated: ${configId}`);
    return config;
  }

  async delete(configId: string): Promise<void> {
    const config = await this.findById(configId);
    await this.ssoConfigModel.deleteOne({ _id: configId }).exec();

    await this.eventsService.createEvent({
      orgId: config.orgId.toString(),
      type: 'SSO_CONFIG_DELETED' as any,
      severity: 'warning',
      message: `SSO configuration "${config.name}" deleted`,
    });

    this.logger.log(`SSO config deleted: ${configId}`);
  }

  // ==================== SSO Authentication ====================

  async handleSsoCallback(ssoUser: SsoUser, configId: string): Promise<{ token: string; redirectUrl: string }> {
    const config = await this.findById(configId);
    if (!config.enabled) {
      throw new BadRequestException('SSO configuration is disabled');
    }

    const orgId = config.orgId.toString();

    // Find or create user
    let user = await this.usersService.findByEmail(ssoUser.email);

    if (!user) {
      // Just-in-time provisioning
      if (!config.allowJitProvisioning) {
        throw new BadRequestException('User not found and JIT provisioning is disabled');
      }

      // Create user with random password hash (SSO users won't use it)
      const randomPasswordHash = crypto.randomBytes(32).toString('hex');
      const fullName = [ssoUser.firstName, ssoUser.lastName].filter(Boolean).join(' ') || ssoUser.email.split('@')[0];
      
      const createdUser = await this.usersService.create({
        email: ssoUser.email,
        passwordHash: randomPasswordHash,
        name: fullName,
      });

      // Mark as verified since SSO users are pre-verified
      user = await this.usersService.findByEmail(ssoUser.email);
      if (user) {
        user.verified = true;
        await user.save();
        this.logger.log(`JIT provisioned user: ${user.email}`);
      }
    }

    if (!user) {
      throw new BadRequestException('Failed to create or find user');
    }

    // Determine role from groups
    let role = config.defaultRole;
    if (ssoUser.groups && config.roleMapping) {
      for (const group of ssoUser.groups) {
        if (config.roleMapping[group]) {
          role = config.roleMapping[group];
          break;
        }
      }
    }

    // Add user to organization if not already a member
    try {
      await this.orgsService.addMember(orgId, user.id, role);
    } catch (error: any) {
      // User might already be a member
      this.logger.debug(`User ${user.email} may already be a member of org ${orgId}`);
    }

    // Update SSO config stats
    await this.ssoConfigModel.updateOne(
      { _id: configId },
      { $set: { lastUsedAt: new Date() }, $inc: { loginCount: 1 } },
    ).exec();

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      sso: true,
      provider: ssoUser.provider,
    };

    const token = this.jwtService.sign(payload);

    // Log event
    await this.eventsService.createEvent({
      orgId,
      type: 'SSO_LOGIN' as any,
      severity: 'info',
      message: `User ${user.email} logged in via SSO (${ssoUser.provider})`,
      metadata: { userId: user.id, provider: ssoUser.provider },
    });

    return {
      token,
      redirectUrl: `${this.frontendUrl}/auth/sso-callback?token=${token}`,
    };
  }

  // ==================== SAML Helpers ====================

  getSamlCallbackUrl(configId: string): string {
    const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:4000');
    return `${baseUrl}/api/v1/sso/saml/${configId}/callback`;
  }

  getSamlMetadataUrl(configId: string): string {
    const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:4000');
    return `${baseUrl}/api/v1/sso/saml/${configId}/metadata`;
  }

  async generateSamlMetadata(configId: string): Promise<string> {
    const config = await this.findById(configId);
    if (config.type !== 'saml' || !config.saml) {
      throw new BadRequestException('Not a SAML configuration');
    }

    const callbackUrl = this.getSamlCallbackUrl(configId);
    const entityId = config.saml.issuer;

    // Generate SP metadata XML
    const metadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="${config.saml.wantAssertionsSigned}" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>${config.saml.identifierFormat}</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${callbackUrl}" index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

    return metadata;
  }

  // ==================== OIDC Helpers ====================

  getOidcCallbackUrl(configId: string): string {
    const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:4000');
    return `${baseUrl}/api/v1/sso/oidc/${configId}/callback`;
  }

  getWellKnownOidcConfig(provider: string): { issuer: string; authorizationURL: string; tokenURL: string; userInfoURL: string } | null {
    const configs: Record<string, any> = {
      google: {
        issuer: 'https://accounts.google.com',
        authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenURL: 'https://oauth2.googleapis.com/token',
        userInfoURL: 'https://openidconnect.googleapis.com/v1/userinfo',
      },
      microsoft: {
        issuer: 'https://login.microsoftonline.com/common/v2.0',
        authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoURL: 'https://graph.microsoft.com/oidc/userinfo',
      },
    };

    return configs[provider] || null;
  }
}

