import {
  Controller,
  Get,
  Post,
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
import { VectorSearchService } from './vector-search.service';
import { ClustersService } from '../clusters/clusters.service';
import { ProjectsService } from '../projects/projects.service';
import { OrgsService } from '../orgs/orgs.service';
import {
  CreateVectorIndexDto,
  VectorSearchQueryDto,
  SemanticSearchDto,
  HybridSearchDto,
} from './dto/vector-search.dto';

@ApiTags('Vector Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/vector-search')
export class VectorSearchController {
  constructor(
    private readonly vectorSearchService: VectorSearchService,
    private readonly clustersService: ClustersService,
    private readonly projectsService: ProjectsService,
    private readonly orgsService: OrgsService,
  ) {}

  private async verifyAccess(
    userId: string,
    projectId: string,
    clusterId: string,
    roles?: string[],
  ): Promise<string> {
    const orgId = await this.projectsService.getOrgIdForProject(projectId);
    if (!orgId) {
      throw new NotFoundException('Project not found');
    }

    await this.orgsService.checkAccess(orgId, userId, (roles || ['OWNER', 'ADMIN', 'MEMBER']) as any);

    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.projectId.toString() !== projectId) {
      throw new NotFoundException('Cluster not found');
    }

    return orgId;
  }

  // ==================== Index Management ====================

  @Get('indexes')
  @ApiOperation({ summary: 'List vector search indexes' })
  async listIndexes(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const indexes = await this.vectorSearchService.findAllByCluster(clusterId);

    return {
      success: true,
      data: indexes.map((idx) => ({
        id: (idx as any)._id,
        name: idx.name,
        database: idx.database,
        collection: idx.collection,
        type: idx.type,
        status: idx.status,
        vectorFields: idx.vectorFields,
        filterFields: idx.filterFields,
        textFields: idx.textFields,
        documentCount: idx.documentCount,
        indexSizeBytes: idx.indexSizeBytes,
        createdAt: (idx as any).createdAt,
      })),
    };
  }

  @Post('indexes')
  @ApiOperation({ summary: 'Create vector search index' })
  async createIndex(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() createDto: CreateVectorIndexDto,
  ) {
    const orgId = await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const index = await this.vectorSearchService.createIndex(
      clusterId,
      projectId,
      orgId,
      user.userId,
      createDto,
    );

    return {
      success: true,
      data: {
        id: (index as any)._id,
        name: index.name,
        status: index.status,
      },
      message: 'Vector index creation initiated',
    };
  }

  @Get('indexes/:indexId')
  @ApiOperation({ summary: 'Get vector index details' })
  async getIndex(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('indexId') indexId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const index = await this.vectorSearchService.findById(indexId);

    return {
      success: true,
      data: index,
    };
  }

  @Delete('indexes/:indexId')
  @ApiOperation({ summary: 'Delete vector index' })
  async deleteIndex(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('indexId') indexId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    await this.vectorSearchService.delete(indexId);

    return { success: true, message: 'Vector index deletion initiated' };
  }

  @Post('indexes/:indexId/rebuild')
  @ApiOperation({ summary: 'Rebuild vector index' })
  async rebuildIndex(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('indexId') indexId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId, ['OWNER', 'ADMIN']);

    const index = await this.vectorSearchService.rebuildIndex(indexId);

    return {
      success: true,
      data: { id: (index as any)._id, status: index.status },
      message: 'Index rebuild initiated',
    };
  }

  // ==================== Search Operations ====================

  @Post('search')
  @ApiOperation({ summary: 'Execute vector search' })
  @ApiQuery({ name: 'index', required: true, description: 'Index name' })
  @ApiQuery({ name: 'database', required: true })
  @ApiQuery({ name: 'collection', required: true })
  async vectorSearch(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('index') indexName: string,
    @Query('database') database: string,
    @Query('collection') collection: string,
    @Body() queryDto: VectorSearchQueryDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const results = await this.vectorSearchService.vectorSearch(
      clusterId,
      indexName,
      database,
      collection,
      queryDto,
    );

    return {
      success: true,
      data: {
        results,
        count: results.length,
      },
    };
  }

  @Post('semantic-search')
  @ApiOperation({ summary: 'Execute semantic search (text-to-vector)' })
  @ApiQuery({ name: 'index', required: true })
  @ApiQuery({ name: 'database', required: true })
  @ApiQuery({ name: 'collection', required: true })
  async semanticSearch(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('index') indexName: string,
    @Query('database') database: string,
    @Query('collection') collection: string,
    @Body() searchDto: SemanticSearchDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const results = await this.vectorSearchService.semanticSearch(
      clusterId,
      indexName,
      database,
      collection,
      searchDto,
    );

    return {
      success: true,
      data: {
        query: searchDto.query,
        results,
        count: results.length,
      },
    };
  }

  @Post('hybrid-search')
  @ApiOperation({ summary: 'Execute hybrid search (vector + text)' })
  @ApiQuery({ name: 'index', required: true })
  @ApiQuery({ name: 'database', required: true })
  @ApiQuery({ name: 'collection', required: true })
  async hybridSearch(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Query('index') indexName: string,
    @Query('database') database: string,
    @Query('collection') collection: string,
    @Body() searchDto: HybridSearchDto,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    const results = await this.vectorSearchService.hybridSearch(
      clusterId,
      indexName,
      database,
      collection,
      searchDto,
    );

    return {
      success: true,
      data: {
        query: searchDto.query,
        results,
        count: results.length,
      },
    };
  }

  // ==================== Configuration ====================

  @Get('analyzers')
  @ApiOperation({ summary: 'Get available text analyzers' })
  async getAnalyzers(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    return {
      success: true,
      data: this.vectorSearchService.getAvailableAnalyzers(),
    };
  }

  @Get('embedding-models')
  @ApiOperation({ summary: 'Get supported embedding models' })
  async getEmbeddingModels(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
  ) {
    await this.verifyAccess(user.userId, projectId, clusterId);

    return {
      success: true,
      data: this.vectorSearchService.getEmbeddingModels(),
    };
  }
}

