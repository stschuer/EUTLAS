import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { SearchIndexesService } from './search-indexes.service';
import { CreateSearchIndexDto, UpdateSearchIndexDto, TestSearchDto } from './dto/search-index.dto';

@ApiTags('Search Indexes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/search-indexes')
export class SearchIndexesController {
  constructor(private readonly searchIndexesService: SearchIndexesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a search index' })
  async create(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: CreateSearchIndexDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId; // Placeholder
    const index = await this.searchIndexesService.create(
      clusterId,
      projectId,
      orgId,
      user.userId,
      dto,
    );
    return {
      success: true,
      data: index,
      message: 'Search index creation started',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all search indexes for a cluster' })
  @ApiQuery({ name: 'database', required: false })
  @ApiQuery({ name: 'collection', required: false })
  async findAll(
    @Param('clusterId') clusterId: string,
    @Query('database') database?: string,
    @Query('collection') collection?: string,
  ) {
    const indexes = database
      ? await this.searchIndexesService.findByDatabase(clusterId, database, collection)
      : await this.searchIndexesService.findAllByCluster(clusterId);
    return {
      success: true,
      data: indexes,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get search index statistics' })
  async getStats(@Param('clusterId') clusterId: string) {
    const stats = await this.searchIndexesService.getStats(clusterId);
    return {
      success: true,
      data: stats,
    };
  }

  @Get('analyzers')
  @ApiOperation({ summary: 'Get available analyzers' })
  async getAnalyzers() {
    const analyzers = await this.searchIndexesService.getAnalyzers();
    return {
      success: true,
      data: analyzers,
    };
  }

  @Get(':indexId')
  @ApiOperation({ summary: 'Get a specific search index' })
  async findOne(@Param('indexId') indexId: string) {
    const index = await this.searchIndexesService.findById(indexId);
    if (!index) {
      throw new NotFoundException('Search index not found');
    }
    return {
      success: true,
      data: index,
    };
  }

  @Patch(':indexId')
  @ApiOperation({ summary: 'Update a search index' })
  async update(
    @Param('indexId') indexId: string,
    @Body() dto: UpdateSearchIndexDto,
  ) {
    const index = await this.searchIndexesService.update(indexId, dto);
    return {
      success: true,
      data: index,
      message: 'Search index update started',
    };
  }

  @Delete(':indexId')
  @ApiOperation({ summary: 'Delete a search index' })
  async delete(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Param('indexId') indexId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const orgId = user.userId;
    await this.searchIndexesService.delete(indexId, orgId, projectId, clusterId);
    return {
      success: true,
      message: 'Search index deletion started',
    };
  }

  @Post(':indexId/test')
  @ApiOperation({ summary: 'Test a search index' })
  async testSearch(
    @Param('indexId') indexId: string,
    @Body() dto: TestSearchDto,
  ) {
    const result = await this.searchIndexesService.testSearch(indexId, dto);
    return {
      success: true,
      data: result,
    };
  }
}





