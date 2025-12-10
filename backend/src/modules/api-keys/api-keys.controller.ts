import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateApiKeyDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const { apiKey, secretKey } = await this.apiKeysService.create(
      orgId,
      user.userId,
      createDto,
    );

    return {
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        description: apiKey.description,
        publicKey: apiKey.publicKey,
        scopes: apiKey.scopes,
        allowedIps: apiKey.allowedIps,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        secretKey, // Only returned once at creation!
      },
      message: 'API key created. Save the secret key now - it will not be shown again.',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for an organization' })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const apiKeys = await this.apiKeysService.findByOrg(orgId);

    return {
      success: true,
      data: apiKeys,
    };
  }

  @Get(':apiKeyId')
  @ApiOperation({ summary: 'Get API key details' })
  async findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const apiKey = await this.apiKeysService.findById(apiKeyId);
    if (!apiKey || apiKey.orgId.toString() !== orgId) {
      throw new NotFoundException('API key not found');
    }

    return {
      success: true,
      data: apiKey,
    };
  }

  @Patch(':apiKeyId')
  @ApiOperation({ summary: 'Update an API key' })
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('apiKeyId') apiKeyId: string,
    @Body() updateDto: UpdateApiKeyDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const apiKey = await this.apiKeysService.findById(apiKeyId);
    if (!apiKey || apiKey.orgId.toString() !== orgId) {
      throw new NotFoundException('API key not found');
    }

    const updated = await this.apiKeysService.update(apiKeyId, updateDto);

    return {
      success: true,
      data: updated,
    };
  }

  @Delete(':apiKeyId')
  @ApiOperation({ summary: 'Delete an API key' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const apiKey = await this.apiKeysService.findById(apiKeyId);
    if (!apiKey || apiKey.orgId.toString() !== orgId) {
      throw new NotFoundException('API key not found');
    }

    await this.apiKeysService.delete(apiKeyId);

    return {
      success: true,
      message: 'API key deleted',
    };
  }

  @Get('scopes/available')
  @ApiOperation({ summary: 'Get available API key scopes' })
  async getAvailableScopes(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const scopes = [
      { scope: 'clusters:read', description: 'Read cluster information' },
      { scope: 'clusters:write', description: 'Create, update, delete clusters' },
      { scope: 'projects:read', description: 'Read project information' },
      { scope: 'projects:write', description: 'Create, update, delete projects' },
      { scope: 'backups:read', description: 'Read backup information' },
      { scope: 'backups:write', description: 'Create, restore, delete backups' },
      { scope: 'metrics:read', description: 'Read cluster metrics' },
      { scope: 'members:read', description: 'Read organization members' },
      { scope: 'members:write', description: 'Invite and manage members' },
      { scope: 'admin', description: 'Full administrative access' },
    ];

    return {
      success: true,
      data: scopes,
    };
  }
}

