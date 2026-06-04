import { Controller, Post, Get, Param, Body, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { OrgsService } from '../orgs/orgs.service';
import { GdprService, DataSubjectRequestType } from './gdpr.service';

@ApiTags('GDPR / Data Subject Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/gdpr')
export class GdprController {
  constructor(
    private readonly gdprService: GdprService,
    private readonly orgsService: OrgsService,
  ) {}

  @Post('requests')
  @ApiOperation({ summary: 'Create a GDPR data subject request (Art. 15-21)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'requestorEmail', 'requestorName', 'subjectEmail', 'description'],
      properties: {
        type: { type: 'string', enum: ['access', 'rectification', 'erasure', 'portability', 'restriction', 'objection'] },
        requestorEmail: { type: 'string' },
        requestorName: { type: 'string' },
        subjectEmail: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  async createRequest(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() body: {
      type: DataSubjectRequestType;
      requestorEmail: string;
      requestorName: string;
      subjectEmail: string;
      description: string;
    },
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    return this.gdprService.createRequest({ ...body, orgId });
  }

  @Get('requests')
  @ApiOperation({ summary: 'List all GDPR data subject requests for this organization' })
  async listRequests(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    return this.gdprService.listRequests(orgId);
  }

  @Get('requests/overdue')
  @ApiOperation({ summary: 'List overdue GDPR requests (past 30-day deadline)' })
  async getOverdueRequests(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    return this.gdprService.getOverdueRequests(orgId);
  }

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'Get GDPR request details' })
  async getRequest(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    const request = await this.gdprService.getRequest(requestId);
    if (!request || request.orgId.toString() !== orgId) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  @Post('requests/:requestId/process')
  @ApiOperation({ summary: 'Process a GDPR request (execute access/erasure/portability)' })
  async processRequest(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
    const request = await this.gdprService.getRequest(requestId);
    if (!request || request.orgId.toString() !== orgId) {
      throw new NotFoundException('Request not found');
    }

    switch (request.type) {
      case 'access':
        return this.gdprService.processAccessRequest(requestId, user.userId);
      case 'erasure':
        return this.gdprService.processErasureRequest(requestId, user.userId);
      case 'portability':
        return this.gdprService.processPortabilityRequest(requestId, user.userId);
      default:
        return { message: `Request type ${request.type} requires manual processing` };
    }
  }
}
