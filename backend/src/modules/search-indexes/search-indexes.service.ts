import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SearchIndex, SearchIndexDocument, SearchIndexStatus } from './schemas/search-index.schema';
import { CreateSearchIndexDto, UpdateSearchIndexDto, TestSearchDto } from './dto/search-index.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class SearchIndexesService {
  private readonly logger = new Logger(SearchIndexesService.name);

  constructor(
    @InjectModel(SearchIndex.name) private searchIndexModel: Model<SearchIndexDocument>,
    private eventsService: EventsService,
  ) {}

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    dto: CreateSearchIndexDto,
  ): Promise<SearchIndex> {
    // Check for duplicate name
    const existing = await this.searchIndexModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      name: dto.name,
    });

    if (existing) {
      throw new ConflictException(`Search index "${dto.name}" already exists`);
    }

    const searchIndex = new this.searchIndexModel({
      clusterId: new Types.ObjectId(clusterId),
      projectId: new Types.ObjectId(projectId),
      orgId: new Types.ObjectId(orgId),
      name: dto.name,
      database: dto.database,
      collection: dto.collection,
      type: dto.type,
      status: 'pending',
      definition: dto.definition,
      analyzer: dto.analyzer,
      createdBy: new Types.ObjectId(userId),
    });

    await searchIndex.save();

    // Start building the index (simulated)
    this.buildIndex(searchIndex.id);

    // Log event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Search index "${dto.name}" created on ${dto.database}.${dto.collection}`,
      metadata: { indexName: dto.name, type: dto.type },
    });

    this.logger.log(`Created search index ${searchIndex.id} for cluster ${clusterId}`);
    return searchIndex;
  }

  private async buildIndex(indexId: string): Promise<void> {
    // Simulate index building
    const index = await this.searchIndexModel.findById(indexId);
    if (!index) return;

    try {
      // Update to building status
      index.status = 'building';
      index.buildStartedAt = new Date();
      await index.save();

      // Simulate build time (2-5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));

      // Complete the build
      const completed = await this.searchIndexModel.findById(indexId);
      if (completed && completed.status === 'building') {
        completed.status = 'ready';
        completed.buildCompletedAt = new Date();
        completed.documentCount = Math.floor(Math.random() * 10000);
        completed.storageSizeBytes = Math.floor(Math.random() * 10000000);
        await completed.save();

        this.logger.log(`Search index ${indexId} build completed`);
      }
    } catch (error) {
      const failed = await this.searchIndexModel.findById(indexId);
      if (failed) {
        failed.status = 'failed';
        failed.errorMessage = error.message;
        await failed.save();
      }
      this.logger.error(`Search index ${indexId} build failed: ${error.message}`);
    }
  }

  async findAllByCluster(clusterId: string): Promise<SearchIndex[]> {
    return this.searchIndexModel
      .find({ clusterId: new Types.ObjectId(clusterId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByDatabase(
    clusterId: string,
    database: string,
    collection?: string,
  ): Promise<SearchIndex[]> {
    const query: any = {
      clusterId: new Types.ObjectId(clusterId),
      database,
    };
    if (collection) {
      query.collection = collection;
    }
    return this.searchIndexModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(indexId: string): Promise<SearchIndex | null> {
    return this.searchIndexModel.findById(indexId).exec();
  }

  async findByName(clusterId: string, name: string): Promise<SearchIndex | null> {
    return this.searchIndexModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      name,
    }).exec();
  }

  async update(
    indexId: string,
    dto: UpdateSearchIndexDto,
  ): Promise<SearchIndex> {
    const index = await this.searchIndexModel.findById(indexId);
    if (!index) {
      throw new NotFoundException('Search index not found');
    }

    if (dto.definition) {
      index.definition = { ...index.definition, ...dto.definition };
    }
    if (dto.analyzer) {
      index.analyzer = dto.analyzer;
    }

    // Trigger rebuild
    index.status = 'pending';
    await index.save();

    this.buildIndex(indexId);

    return index;
  }

  async delete(indexId: string, orgId: string, projectId: string, clusterId: string): Promise<void> {
    const index = await this.searchIndexModel.findById(indexId);
    if (!index) {
      throw new NotFoundException('Search index not found');
    }

    index.status = 'deleting';
    await index.save();

    // Log event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Search index "${index.name}" deleted`,
      metadata: { indexName: index.name },
    });

    // Actually delete after a short delay (simulate cleanup)
    setTimeout(async () => {
      await this.searchIndexModel.findByIdAndDelete(indexId);
    }, 1000);

    this.logger.log(`Deleted search index ${indexId}`);
  }

  async testSearch(
    indexId: string,
    dto: TestSearchDto,
  ): Promise<{ results: any[]; executionTime: number }> {
    const index = await this.searchIndexModel.findById(indexId);
    if (!index) {
      throw new NotFoundException('Search index not found');
    }

    if (index.status !== 'ready') {
      throw new BadRequestException(`Index is not ready (status: ${index.status})`);
    }

    const startTime = Date.now();

    // Simulate search results
    const results = [];
    const count = Math.min(dto.limit || 10, 20);
    
    for (let i = 0; i < count; i++) {
      results.push({
        _id: new Types.ObjectId().toString(),
        score: Math.random() * 10,
        document: {
          title: `Result ${i + 1} for "${dto.query}"`,
          content: `This is a simulated search result matching your query.`,
          timestamp: new Date(Date.now() - Math.random() * 86400000 * 30),
        },
      });
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Update query count
    index.queryCount = (index.queryCount || 0) + 1;
    index.lastQueryAt = new Date();
    await index.save();

    const executionTime = Date.now() - startTime;

    return { results, executionTime };
  }

  async getStats(clusterId: string): Promise<{
    totalIndexes: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalQueries: number;
    totalStorageBytes: number;
  }> {
    const indexes = await this.searchIndexModel.find({
      clusterId: new Types.ObjectId(clusterId),
    }).exec();

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalQueries = 0;
    let totalStorageBytes = 0;

    for (const index of indexes) {
      byStatus[index.status] = (byStatus[index.status] || 0) + 1;
      byType[index.type] = (byType[index.type] || 0) + 1;
      totalQueries += index.queryCount || 0;
      totalStorageBytes += index.storageSizeBytes || 0;
    }

    return {
      totalIndexes: indexes.length,
      byStatus,
      byType,
      totalQueries,
      totalStorageBytes,
    };
  }

  async getAnalyzers(): Promise<string[]> {
    return [
      'lucene.standard',
      'lucene.simple',
      'lucene.whitespace',
      'lucene.keyword',
      'lucene.english',
      'lucene.german',
      'lucene.french',
      'lucene.spanish',
      'lucene.italian',
      'lucene.portuguese',
      'lucene.arabic',
      'lucene.chinese',
      'lucene.japanese',
      'lucene.korean',
    ];
  }
}


