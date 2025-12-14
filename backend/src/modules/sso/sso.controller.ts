import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SsoService } from './sso.service';
import { OrgsService } from '../orgs/orgs.service';
import { CreateSsoConfigDto, UpdateSsoConfigDto } from './dto/sso-config.dto';

@ApiTags('SSO')
@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly ssoService: SsoService,
    private readonly orgsService: OrgsService,
  ) {}

  // ==================== SSO Config Management ====================

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('orgs/:orgId/configs')
  @ApiOperation({ summary: 'List SSO configurations for an organization' })
  async listConfigs(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const configs = await this.ssoService.findAllByOrg(orgId);

    // Remove sensitive data
    const sanitized = configs.map((c) => ({
      id: (c as any)._id,
      name: c.name,
      type: c.type,
      enabled: c.enabled,
      enforced: c.enforced,
      emailDomains: c.emailDomains,
      defaultRole: c.defaultRole,
      allowJitProvisioning: c.allowJitProvisioning,
      lastUsedAt: c.lastUsedAt,
      loginCount: c.loginCount,
      createdAt: (c as any).createdAt,
      // Include provider info for OIDC
      provider: c.oidc?.provider,
    }));

    return { success: true, data: sanitized };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('orgs/:orgId/configs')
  @ApiOperation({ summary: 'Create SSO configuration' })
  async createConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateSsoConfigDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const config = await this.ssoService.create(orgId, user.userId, createDto);

    return {
      success: true,
      data: {
        id: (config as any)._id,
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        // Include setup URLs
        callbackUrl: config.type === 'saml'
          ? this.ssoService.getSamlCallbackUrl((config as any)._id.toString())
          : this.ssoService.getOidcCallbackUrl((config as any)._id.toString()),
        metadataUrl: config.type === 'saml'
          ? this.ssoService.getSamlMetadataUrl((config as any)._id.toString())
          : undefined,
      },
      message: 'SSO configuration created',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('orgs/:orgId/configs/:configId')
  @ApiOperation({ summary: 'Get SSO configuration details' })
  async getConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('configId') configId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const config = await this.ssoService.findById(configId);

    // Verify ownership
    if (config.orgId.toString() !== orgId) {
      throw new NotFoundException('SSO configuration not found');
    }

    return {
      success: true,
      data: {
        id: (config as any)._id,
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        enforced: config.enforced,
        emailDomains: config.emailDomains,
        roleMapping: config.roleMapping,
        defaultRole: config.defaultRole,
        allowJitProvisioning: config.allowJitProvisioning,
        lastUsedAt: config.lastUsedAt,
        loginCount: config.loginCount,
        // SAML specific
        saml: config.saml ? {
          entryPoint: config.saml.entryPoint,
          issuer: config.saml.issuer,
          identifierFormat: config.saml.identifierFormat,
          attributeMapping: config.saml.attributeMapping,
          // Don't expose cert/keys
        } : undefined,
        // OIDC specific
        oidc: config.oidc ? {
          provider: config.oidc.provider,
          clientId: config.oidc.clientId,
          issuer: config.oidc.issuer,
          scope: config.oidc.scope,
          attributeMapping: config.oidc.attributeMapping,
          // Don't expose clientSecret
        } : undefined,
        // Setup URLs
        callbackUrl: config.type === 'saml'
          ? this.ssoService.getSamlCallbackUrl(configId)
          : this.ssoService.getOidcCallbackUrl(configId),
        metadataUrl: config.type === 'saml'
          ? this.ssoService.getSamlMetadataUrl(configId)
          : undefined,
      },
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put('orgs/:orgId/configs/:configId')
  @ApiOperation({ summary: 'Update SSO configuration' })
  async updateConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('configId') configId: string,
    @Body() updateDto: UpdateSsoConfigDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const config = await this.ssoService.findById(configId);
    if (config.orgId.toString() !== orgId) {
      throw new NotFoundException('SSO configuration not found');
    }

    const updated = await this.ssoService.update(configId, user.userId, updateDto);

    return {
      success: true,
      data: { id: (updated as any)._id, enabled: updated.enabled },
      message: 'SSO configuration updated',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('orgs/:orgId/configs/:configId')
  @ApiOperation({ summary: 'Delete SSO configuration' })
  async deleteConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('configId') configId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const config = await this.ssoService.findById(configId);
    if (config.orgId.toString() !== orgId) {
      throw new NotFoundException('SSO configuration not found');
    }

    await this.ssoService.delete(configId);

    return { success: true, message: 'SSO configuration deleted' };
  }

  // ==================== SAML Endpoints ====================

  @Public()
  @Get('saml/:configId/metadata')
  @ApiOperation({ summary: 'Get SAML Service Provider metadata' })
  async getSamlMetadata(
    @Param('configId') configId: string,
    @Res() res: Response,
  ) {
    const metadata = await this.ssoService.generateSamlMetadata(configId);

    res.type('application/xml');
    res.send(metadata);
  }

  @Public()
  @Get('saml/:configId/login')
  @ApiOperation({ summary: 'Initiate SAML login' })
  async initiateSamlLogin(
    @Param('configId') configId: string,
    @Query('redirect') redirect: string,
    @Res() res: Response,
  ) {
    const config = await this.ssoService.findById(configId);
    if (!config.enabled || config.type !== 'saml' || !config.saml) {
      throw new BadRequestException('SAML is not configured or disabled');
    }

    // In a real implementation, we'd use passport-saml to generate the AuthnRequest
    // For now, redirect to the IdP entry point
    const callbackUrl = this.ssoService.getSamlCallbackUrl(configId);
    const samlRequest = `SAMLRequest=${encodeURIComponent(config.saml.issuer)}&RelayState=${encodeURIComponent(redirect || '/')}`;
    
    this.logger.log(`Initiating SAML login for config ${configId}`);
    
    // Redirect to IdP
    res.redirect(`${config.saml.entryPoint}?${samlRequest}`);
  }

  @Public()
  @Post('saml/:configId/callback')
  @ApiOperation({ summary: 'SAML Assertion Consumer Service (ACS)' })
  async handleSamlCallback(
    @Param('configId') configId: string,
    @Body() body: { SAMLResponse: string; RelayState?: string },
    @Res() res: Response,
  ) {
    this.logger.log(`Received SAML callback for config ${configId}`);

    try {
      // In a real implementation, we'd validate the SAML response using passport-saml
      // For demonstration, we'll parse basic info (in production, use proper SAML validation)
      
      // Decode SAML response (base64)
      const samlResponse = Buffer.from(body.SAMLResponse, 'base64').toString('utf-8');
      
      // Extract email from SAML response (simplified - use proper XML parsing in production)
      const emailMatch = samlResponse.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
      const email = emailMatch ? emailMatch[1] : null;

      if (!email) {
        throw new BadRequestException('No email found in SAML response');
      }

      const result = await this.ssoService.handleSsoCallback(
        {
          email,
          provider: 'saml',
        },
        configId,
      );

      // Redirect to frontend with token
      res.redirect(result.redirectUrl);
    } catch (error: any) {
      this.logger.error(`SAML callback error: ${error.message}`);
      res.redirect(`${this.ssoService['frontendUrl']}/login?error=sso_failed`);
    }
  }

  // ==================== OIDC Endpoints ====================

  @Public()
  @Get('oidc/:configId/login')
  @ApiOperation({ summary: 'Initiate OIDC login' })
  async initiateOidcLogin(
    @Param('configId') configId: string,
    @Query('redirect') redirect: string,
    @Res() res: Response,
  ) {
    const config = await this.ssoService.findById(configId);
    if (!config.enabled || config.type !== 'oidc' || !config.oidc) {
      throw new BadRequestException('OIDC is not configured or disabled');
    }

    // Get well-known config or use custom
    const oidcConfig = this.ssoService.getWellKnownOidcConfig(config.oidc.provider);
    const authorizationURL = config.oidc.authorizationURL || oidcConfig?.authorizationURL;

    if (!authorizationURL) {
      throw new BadRequestException('Authorization URL not configured');
    }

    const callbackUrl = this.ssoService.getOidcCallbackUrl(configId);
    const state = Buffer.from(JSON.stringify({ configId, redirect: redirect || '/' })).toString('base64');
    const scope = config.oidc.scope?.join(' ') || 'openid email profile';

    const params = new URLSearchParams({
      client_id: config.oidc.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope,
      state,
    });

    this.logger.log(`Initiating OIDC login for config ${configId} (${config.oidc.provider})`);
    
    res.redirect(`${authorizationURL}?${params.toString()}`);
  }

  @Public()
  @Get('oidc/:configId/callback')
  @ApiOperation({ summary: 'OIDC callback' })
  async handleOidcCallback(
    @Param('configId') configId: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      this.logger.error(`OIDC error: ${error}`);
      res.redirect(`${this.ssoService['frontendUrl']}/login?error=sso_failed`);
      return;
    }

    this.logger.log(`Received OIDC callback for config ${configId}`);

    try {
      const config = await this.ssoService.findById(configId);
      if (!config.oidc) {
        throw new BadRequestException('OIDC not configured');
      }

      // Get well-known config or use custom
      const oidcConfig = this.ssoService.getWellKnownOidcConfig(config.oidc.provider);
      const tokenURL = config.oidc.tokenURL || oidcConfig?.tokenURL;
      const userInfoURL = config.oidc.userInfoURL || oidcConfig?.userInfoURL;

      if (!tokenURL) {
        throw new BadRequestException('Token URL not configured');
      }

      const callbackUrl = this.ssoService.getOidcCallbackUrl(configId);

      // Exchange code for tokens
      const tokenResponse = await fetch(tokenURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          client_id: config.oidc.clientId,
          client_secret: config.oidc.clientSecret,
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new BadRequestException(`Token exchange failed: ${tokens.error}`);
      }

      // Get user info
      let email: string | undefined;
      let firstName: string | undefined;
      let lastName: string | undefined;

      if (userInfoURL && tokens.access_token) {
        const userInfoResponse = await fetch(userInfoURL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoResponse.json();

        email = userInfo.email;
        firstName = userInfo.given_name || userInfo.first_name;
        lastName = userInfo.family_name || userInfo.last_name;
      }

      // If no userinfo endpoint, try to decode ID token
      if (!email && tokens.id_token) {
        const [, payload] = tokens.id_token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        email = decoded.email;
        firstName = decoded.given_name;
        lastName = decoded.family_name;
      }

      if (!email) {
        throw new BadRequestException('No email found in OIDC response');
      }

      const result = await this.ssoService.handleSsoCallback(
        {
          email,
          firstName,
          lastName,
          provider: config.oidc.provider,
        },
        configId,
      );

      res.redirect(result.redirectUrl);
    } catch (err: any) {
      this.logger.error(`OIDC callback error: ${err.message}`);
      res.redirect(`${this.ssoService['frontendUrl']}/login?error=sso_failed`);
    }
  }

  // ==================== SSO Discovery ====================

  @Public()
  @Get('discover')
  @ApiOperation({ summary: 'Discover SSO configuration by email domain' })
  @ApiQuery({ name: 'email', required: true })
  async discoverSso(@Query('email') email: string) {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Invalid email');
    }

    const domain = email.split('@')[1].toLowerCase();
    const config = await this.ssoService.findByEmailDomain(domain);

    if (!config) {
      return { success: true, data: { ssoAvailable: false } };
    }

    return {
      success: true,
      data: {
        ssoAvailable: true,
        type: config.type,
        provider: config.oidc?.provider,
        loginUrl: config.type === 'saml'
          ? `/api/v1/sso/saml/${(config as any)._id}/login`
          : `/api/v1/sso/oidc/${(config as any)._id}/login`,
        enforced: config.enforced,
      },
    };
  }
}




