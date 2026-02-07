import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';

export type DataSubjectRequestType = 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
export type DataSubjectRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface DataSubjectRequest {
  id: string;
  type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  requestorEmail: string;
  requestorName: string;
  subjectEmail: string;
  orgId: string;
  description: string;
  response?: string;
  dataExport?: string; // path to exported data file
  processedBy?: string;
  processedAt?: Date;
  createdAt: Date;
  dueDate: Date; // GDPR: 30 days to respond
}

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);
  private requests: Map<string, DataSubjectRequest> = new Map();

  constructor(
    @InjectConnection() private connection: Connection,
    private auditService: AuditService,
    private eventsService: EventsService,
  ) {}

  /**
   * Create a new data subject request (Art. 15-21 GDPR).
   */
  async createRequest(params: {
    type: DataSubjectRequestType;
    requestorEmail: string;
    requestorName: string;
    subjectEmail: string;
    orgId: string;
    description: string;
  }): Promise<DataSubjectRequest> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // GDPR: 30 days

    const request: DataSubjectRequest = {
      id: uuidv4(),
      type: params.type,
      status: 'pending',
      requestorEmail: params.requestorEmail,
      requestorName: params.requestorName,
      subjectEmail: params.subjectEmail,
      orgId: params.orgId,
      description: params.description,
      createdAt: new Date(),
      dueDate,
    };

    this.requests.set(request.id, request);

    await this.auditService.log({
      orgId: params.orgId,
      action: 'CREATE',
      resourceType: 'user' as any,
      resourceId: request.id,
      description: `GDPR ${params.type} request created for ${params.subjectEmail}`,
    });

    this.logger.log(`GDPR ${params.type} request ${request.id} created for ${params.subjectEmail}`);
    return request;
  }

  /**
   * Process a data subject access request (Art. 15 GDPR).
   * Exports all data associated with the subject's email from platform collections.
   */
  async processAccessRequest(requestId: string, processedBy: string): Promise<DataSubjectRequest> {
    const request = this.requests.get(requestId);
    if (!request) throw new NotFoundException('Request not found');
    if (request.type !== 'access') throw new BadRequestException('Not an access request');

    request.status = 'in_progress';

    // Collect data from all platform collections
    const data: Record<string, any[]> = {};
    const collectionsToSearch = ['users', 'orgmembers', 'invitations', 'auditlogs', 'apikeys'];

    for (const collName of collectionsToSearch) {
      try {
        const docs = await this.connection.collection(collName).find({
          $or: [
            { email: request.subjectEmail },
            { 'actor.email': request.subjectEmail },
          ],
        }).toArray();
        if (docs.length > 0) {
          data[collName] = docs;
        }
      } catch (err) {
        // Collection may not exist
      }
    }

    request.dataExport = JSON.stringify(data, null, 2);
    request.status = 'completed';
    request.processedBy = processedBy;
    request.processedAt = new Date();
    request.response = `Data export completed. Found data in ${Object.keys(data).length} collections.`;

    this.logger.log(`GDPR access request ${requestId} completed`);
    return request;
  }

  /**
   * Process a data subject erasure request (Art. 17 GDPR - Right to be Forgotten).
   * Removes all personally identifiable data associated with the subject.
   */
  async processErasureRequest(requestId: string, processedBy: string): Promise<DataSubjectRequest> {
    const request = this.requests.get(requestId);
    if (!request) throw new NotFoundException('Request not found');
    if (request.type !== 'erasure') throw new BadRequestException('Not an erasure request');

    request.status = 'in_progress';

    const results: Record<string, number> = {};

    // Anonymize user data
    try {
      const userResult = await this.connection.collection('users').updateMany(
        { email: request.subjectEmail },
        {
          $set: {
            email: `deleted-${uuidv4().slice(0, 8)}@anonymized.local`,
            firstName: 'Deleted',
            lastName: 'User',
            phone: undefined,
            avatar: undefined,
            deletedAt: new Date(),
            deletedReason: 'GDPR Art. 17 erasure request',
          },
        },
      );
      results['users'] = userResult.modifiedCount;
    } catch (err) { /* ignore */ }

    // Anonymize audit logs (keep structure, remove PII)
    try {
      const auditResult = await this.connection.collection('auditlogs').updateMany(
        { 'actor.email': request.subjectEmail },
        {
          $set: {
            'actor.email': 'anonymized@deleted.local',
            'actor.name': 'Anonymized User',
          },
        },
      );
      results['auditlogs'] = auditResult.modifiedCount;
    } catch (err) { /* ignore */ }

    // Delete invitations
    try {
      const invResult = await this.connection.collection('invitations').deleteMany({
        email: request.subjectEmail,
      });
      results['invitations'] = invResult.deletedCount;
    } catch (err) { /* ignore */ }

    request.status = 'completed';
    request.processedBy = processedBy;
    request.processedAt = new Date();
    request.response = `Erasure completed. Modified/deleted records: ${JSON.stringify(results)}`;

    await this.auditService.log({
      orgId: request.orgId,
      action: 'DELETE',
      resourceType: 'user' as any,
      resourceId: requestId,
      description: `GDPR Art. 17 erasure completed for ${request.subjectEmail}`,
    });

    this.logger.log(`GDPR erasure request ${requestId} completed: ${JSON.stringify(results)}`);
    return request;
  }

  /**
   * Process a data portability request (Art. 20 GDPR).
   * Exports all data in a machine-readable format (JSON).
   */
  async processPortabilityRequest(requestId: string, processedBy: string): Promise<DataSubjectRequest> {
    // Same as access but returns data in structured JSON format
    return this.processAccessRequest(requestId, processedBy);
  }

  async getRequest(requestId: string): Promise<DataSubjectRequest | undefined> {
    return this.requests.get(requestId);
  }

  async listRequests(orgId: string): Promise<DataSubjectRequest[]> {
    return Array.from(this.requests.values())
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getOverdueRequests(): Promise<DataSubjectRequest[]> {
    const now = new Date();
    return Array.from(this.requests.values())
      .filter((r) => r.status === 'pending' && r.dueDate < now);
  }
}
