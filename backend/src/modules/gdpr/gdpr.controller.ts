import { Controller, Post, Get, Param, Body, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { GdprService, DataSubjectRequestType } from './gdpr.service';

@ApiTags('GDPR / Data Subject Requests')
@Controller('orgs/:orgId/gdpr')
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

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
    @Param('orgId') orgId: string,
    @Body() body: {
      type: DataSubjectRequestType;
      requestorEmail: string;
      requestorName: string;
      subjectEmail: string;
      description: string;
    },
  ) {
    return this.gdprService.createRequest({ ...body, orgId });
  }

  @Get('requests')
  @ApiOperation({ summary: 'List all GDPR data subject requests for this organization' })
  async listRequests(@Param('orgId') orgId: string) {
    return this.gdprService.listRequests(orgId);
  }

  @Get('requests/overdue')
  @ApiOperation({ summary: 'List overdue GDPR requests (past 30-day deadline)' })
  async getOverdueRequests() {
    return this.gdprService.getOverdueRequests();
  }

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'Get GDPR request details' })
  async getRequest(@Param('requestId') requestId: string) {
    return this.gdprService.getRequest(requestId);
  }

  @Post('requests/:requestId/process')
  @ApiOperation({ summary: 'Process a GDPR request (execute access/erasure/portability)' })
  async processRequest(
    @Param('requestId') requestId: string,
    @Request() req: any,
  ) {
    const request = await this.gdprService.getRequest(requestId);
    if (!request) {
      return { error: 'Request not found' };
    }

    const processedBy = req.user?.id || 'system';

    switch (request.type) {
      case 'access':
        return this.gdprService.processAccessRequest(requestId, processedBy);
      case 'erasure':
        return this.gdprService.processErasureRequest(requestId, processedBy);
      case 'portability':
        return this.gdprService.processPortabilityRequest(requestId, processedBy);
      default:
        return { message: `Request type ${request.type} requires manual processing` };
    }
  }
}
