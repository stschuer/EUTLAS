import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { DataExplorerService } from './data-explorer.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import {
  CreateDatabaseDto,
  CreateCollectionDto,
  QueryDocumentsDto,
  InsertDocumentDto,
  UpdateDocumentDto,
  DeleteDocumentsDto,
  CreateIndexDto,
  RunAggregationDto,
} from './dto/data-explorer.dto';

@ApiTags('Data Explorer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/explorer')
export class DataExplorerController {
  constructor(
    private readonly dataExplorerService: DataExplorerService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  // ==================== Databases ====================

  @Get('databases')
  @ApiOperation({ summary: 'List all databases' })
  async listDatabases(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const databases = await this.dataExplorerService.listDatabases(clusterId);

    return {
      success: true,
      data: databases,
    };
  }

  @Post('databases')
  @ApiOperation({ summary: 'Create a database' })
  async createDatabase(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() createDto: CreateDatabaseDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN', 'MEMBER']);

    await this.dataExplorerService.createDatabase(clusterId, createDto.name);

    return {
      success: true,
      message: `Database "${createDto.name}" created`,
    };
  }

  @Delete('databases/:dbName')
  @ApiOperation({ summary: 'Drop a database' })
  async dropDatabase(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.dataExplorerService.dropDatabase(clusterId, dbName);

    return {
      success: true,
      message: `Database "${dbName}" dropped`,
    };
  }

  // ==================== Collections ====================

  @Get('databases/:dbName/collections')
  @ApiOperation({ summary: 'List all collections in a database' })
  async listCollections(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const collections = await this.dataExplorerService.listCollections(clusterId, dbName);

    return {
      success: true,
      data: collections,
    };
  }

  @Post('databases/:dbName/collections')
  @ApiOperation({ summary: 'Create a collection' })
  async createCollection(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Body() createDto: CreateCollectionDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN', 'MEMBER']);

    await this.dataExplorerService.createCollection(clusterId, dbName, createDto.name);

    return {
      success: true,
      message: `Collection "${createDto.name}" created`,
    };
  }

  @Delete('databases/:dbName/collections/:collectionName')
  @ApiOperation({ summary: 'Drop a collection' })
  async dropCollection(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.dataExplorerService.dropCollection(clusterId, dbName, collectionName);

    return {
      success: true,
      message: `Collection "${collectionName}" dropped`,
    };
  }

  // ==================== Documents ====================

  @Post('databases/:dbName/collections/:collectionName/find')
  @ApiOperation({ summary: 'Query documents' })
  async findDocuments(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Body() queryDto: QueryDocumentsDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const result = await this.dataExplorerService.findDocuments(
      clusterId,
      dbName,
      collectionName,
      queryDto,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get('databases/:dbName/collections/:collectionName/documents/:documentId')
  @ApiOperation({ summary: 'Get a single document by ID' })
  async findDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Param('documentId') documentId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const document = await this.dataExplorerService.findDocumentById(
      clusterId,
      dbName,
      collectionName,
      documentId,
    );

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return {
      success: true,
      data: document,
    };
  }

  @Post('databases/:dbName/collections/:collectionName/documents')
  @ApiOperation({ summary: 'Insert a document' })
  async insertDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Body() insertDto: InsertDocumentDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN', 'MEMBER']);

    const result = await this.dataExplorerService.insertDocument(
      clusterId,
      dbName,
      collectionName,
      insertDto.document,
    );

    return {
      success: true,
      data: result,
      message: 'Document inserted',
    };
  }

  @Put('databases/:dbName/collections/:collectionName/documents/:documentId')
  @ApiOperation({ summary: 'Update a document' })
  async updateDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Param('documentId') documentId: string,
    @Body() updateDto: UpdateDocumentDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN', 'MEMBER']);

    const result = await this.dataExplorerService.updateDocument(
      clusterId,
      dbName,
      collectionName,
      documentId,
      updateDto.document,
    );

    return {
      success: true,
      data: result,
      message: 'Document updated',
    };
  }

  @Delete('databases/:dbName/collections/:collectionName/documents/:documentId')
  @ApiOperation({ summary: 'Delete a document' })
  async deleteDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Param('documentId') documentId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN', 'MEMBER']);

    const result = await this.dataExplorerService.deleteDocument(
      clusterId,
      dbName,
      collectionName,
      documentId,
    );

    return {
      success: true,
      data: result,
      message: 'Document deleted',
    };
  }

  @Post('databases/:dbName/collections/:collectionName/deleteMany')
  @ApiOperation({ summary: 'Delete multiple documents' })
  async deleteDocuments(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Body() deleteDto: DeleteDocumentsDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const result = await this.dataExplorerService.deleteDocuments(
      clusterId,
      dbName,
      collectionName,
      deleteDto.filter,
    );

    return {
      success: true,
      data: result,
      message: `${result.deletedCount} document(s) deleted`,
    };
  }

  // ==================== Indexes ====================

  @Get('databases/:dbName/collections/:collectionName/indexes')
  @ApiOperation({ summary: 'List indexes' })
  async listIndexes(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const indexes = await this.dataExplorerService.listIndexes(
      clusterId,
      dbName,
      collectionName,
    );

    return {
      success: true,
      data: indexes,
    };
  }

  @Post('databases/:dbName/collections/:collectionName/indexes')
  @ApiOperation({ summary: 'Create an index' })
  async createIndex(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Body() createDto: CreateIndexDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const result = await this.dataExplorerService.createIndex(
      clusterId,
      dbName,
      collectionName,
      createDto.keys,
      {
        name: createDto.name,
        unique: createDto.unique,
        sparse: createDto.sparse,
        expireAfterSeconds: createDto.expireAfterSeconds,
        background: createDto.background,
      },
    );

    return {
      success: true,
      data: result,
      message: `Index "${result.indexName}" created`,
    };
  }

  @Delete('databases/:dbName/collections/:collectionName/indexes/:indexName')
  @ApiOperation({ summary: 'Drop an index' })
  async dropIndex(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Param('indexName') indexName: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.dataExplorerService.dropIndex(
      clusterId,
      dbName,
      collectionName,
      indexName,
    );

    return {
      success: true,
      message: `Index "${indexName}" dropped`,
    };
  }

  // ==================== Aggregation ====================

  @Post('databases/:dbName/collections/:collectionName/aggregate')
  @ApiOperation({ summary: 'Run an aggregation pipeline' })
  async runAggregation(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('dbName') dbName: string,
    @Param('collectionName') collectionName: string,
    @Body() aggregationDto: RunAggregationDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const result = await this.dataExplorerService.runAggregation(
      clusterId,
      dbName,
      collectionName,
      aggregationDto.pipeline,
    );

    return {
      success: true,
      data: result,
    };
  }

  // ==================== Helper ====================

  private async verifyAccess(
    userId: string,
    projectId: string,
    clusterId: string,
    requiredRoles?: ('OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY')[],
  ): Promise<string> {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, userId, requiredRoles);

    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    return orgId;
  }
}




