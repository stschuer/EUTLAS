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
import { VectorIndex, VectorIndexDocument } from './schemas/vector-index.schema';
import { CreateVectorIndexDto, VectorSearchQueryDto, SemanticSearchDto, HybridSearchDto } from './dto/vector-search.dto';
import { ClustersService } from '../clusters/clusters.service';
import { EventsService } from '../events/events.service';

// Pre-defined analyzers
const BUILT_IN_ANALYZERS = {
  lucene: {
    standard: { tokenizer: 'standard', filters: ['lowercase', 'asciifolding'] },
    simple: { tokenizer: 'letter', filters: ['lowercase'] },
    whitespace: { tokenizer: 'whitespace', filters: [] },
    keyword: { tokenizer: 'keyword', filters: [] },
  },
  language: {
    english: { tokenizer: 'standard', filters: ['lowercase', 'englishPossessive', 'snowballStemming'] },
    german: { tokenizer: 'standard', filters: ['lowercase', 'germanNormalization', 'snowballStemming'] },
    french: { tokenizer: 'standard', filters: ['lowercase', 'frenchElision', 'snowballStemming'] },
    spanish: { tokenizer: 'standard', filters: ['lowercase', 'snowballStemming'] },
  },
};

// Embedding dimensions for common models
const EMBEDDING_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'embed-english-v3.0': 1024,
  'embed-multilingual-v3.0': 1024,
  'all-MiniLM-L6-v2': 384,
  'all-mpnet-base-v2': 768,
};

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @InjectModel(VectorIndex.name) private vectorIndexModel: Model<VectorIndexDocument>,
    private readonly configService: ConfigService,
    private readonly clustersService: ClustersService,
    private readonly eventsService: EventsService,
  ) {}

  // ==================== Index Management ====================

  async createIndex(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    createDto: CreateVectorIndexDto,
  ): Promise<VectorIndex> {
    // Check for existing index
    const existing = await this.vectorIndexModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      database: createDto.database,
      collection: createDto.collection,
      name: createDto.name,
    }).exec();

    if (existing) {
      throw new ConflictException('An index with this name already exists on this collection');
    }

    // Validate vector dimensions
    for (const field of createDto.vectorFields) {
      if (field.dimensions < 1 || field.dimensions > 4096) {
        throw new BadRequestException(`Vector dimensions must be between 1 and 4096, got ${field.dimensions}`);
      }
    }

    const index = new this.vectorIndexModel({
      clusterId: new Types.ObjectId(clusterId),
      projectId: new Types.ObjectId(projectId),
      orgId: new Types.ObjectId(orgId),
      createdBy: new Types.ObjectId(userId),
      ...createDto,
      status: 'pending',
    });

    await index.save();

    // Log event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'VECTOR_INDEX_CREATED' as any,
      severity: 'info',
      message: `Vector search index "${createDto.name}" created on ${createDto.database}.${createDto.collection}`,
    });

    // Simulate index building
    this.buildIndexAsync(index._id.toString());

    this.logger.log(`Vector index created: ${index._id}`);
    return index;
  }

  private async buildIndexAsync(indexId: string): Promise<void> {
    // Update status to building
    await this.vectorIndexModel.updateOne(
      { _id: indexId },
      { 
        status: 'building',
        buildStartedAt: new Date(),
      },
    ).exec();

    // Simulate build time
    setTimeout(async () => {
      try {
        // Simulate successful build
        const docCount = Math.floor(Math.random() * 10000) + 100;
        const indexSize = docCount * 1024 * 4; // Approximate size

        await this.vectorIndexModel.updateOne(
          { _id: indexId },
          {
            status: 'ready',
            buildCompletedAt: new Date(),
            documentCount: docCount,
            indexSizeBytes: indexSize,
          },
        ).exec();

        this.logger.log(`Vector index ${indexId} built successfully`);
      } catch (error: any) {
        await this.vectorIndexModel.updateOne(
          { _id: indexId },
          {
            status: 'failed',
            errorMessage: error.message,
          },
        ).exec();
      }
    }, 3000); // Simulate 3 second build time
  }

  async findAllByCluster(clusterId: string): Promise<VectorIndex[]> {
    return this.vectorIndexModel.find({
      clusterId: new Types.ObjectId(clusterId),
    }).sort({ createdAt: -1 }).exec();
  }

  async findById(indexId: string): Promise<VectorIndex> {
    const index = await this.vectorIndexModel.findById(indexId).exec();
    if (!index) {
      throw new NotFoundException('Vector index not found');
    }
    return index;
  }

  async delete(indexId: string): Promise<void> {
    const index = await this.findById(indexId);

    await this.vectorIndexModel.updateOne(
      { _id: indexId },
      { status: 'deleting' },
    ).exec();

    // Simulate async deletion
    setTimeout(async () => {
      await this.vectorIndexModel.deleteOne({ _id: indexId }).exec();
      this.logger.log(`Vector index deleted: ${indexId}`);
    }, 1000);

    await this.eventsService.createEvent({
      orgId: index.orgId.toString(),
      projectId: index.projectId.toString(),
      clusterId: index.clusterId.toString(),
      type: 'VECTOR_INDEX_DELETED' as any,
      severity: 'warning',
      message: `Vector search index "${index.name}" deleted`,
    });
  }

  async rebuildIndex(indexId: string): Promise<VectorIndex> {
    const index = await this.findById(indexId);

    if (index.status === 'building') {
      throw new BadRequestException('Index is already building');
    }

    await this.vectorIndexModel.updateOne(
      { _id: indexId },
      { status: 'pending', errorMessage: null },
    ).exec();

    this.buildIndexAsync(indexId);

    return this.findById(indexId);
  }

  // ==================== Vector Search ====================

  async vectorSearch(
    clusterId: string,
    indexName: string,
    database: string,
    collection: string,
    queryDto: VectorSearchQueryDto,
  ): Promise<any[]> {
    // Find the index
    const index = await this.vectorIndexModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      database,
      collection,
      name: indexName,
      status: 'ready',
    }).exec();

    if (!index) {
      throw new NotFoundException('Vector index not found or not ready');
    }

    // Validate vector dimensions
    const vectorField = index.vectorFields.find((f) => f.path === queryDto.path);
    if (!vectorField) {
      throw new BadRequestException(`Vector field "${queryDto.path}" not found in index`);
    }

    if (queryDto.vector.length !== vectorField.dimensions) {
      throw new BadRequestException(
        `Vector dimensions mismatch: expected ${vectorField.dimensions}, got ${queryDto.vector.length}`,
      );
    }

    // In production, this would execute a $vectorSearch aggregation
    // For demo, return simulated results
    const limit = queryDto.limit || 10;
    const results = this.simulateVectorSearchResults(limit, queryDto);

    this.logger.log(`Vector search executed on ${database}.${collection} with index ${indexName}`);
    return results;
  }

  private simulateVectorSearchResults(limit: number, query: VectorSearchQueryDto): any[] {
    const results = [];
    for (let i = 0; i < limit; i++) {
      results.push({
        _id: new Types.ObjectId().toString(),
        score: 1 - i * 0.05 - Math.random() * 0.02, // Decreasing scores
        document: {
          title: `Document ${i + 1}`,
          content: `This is simulated content for search result ${i + 1}`,
          [query.path]: `[${query.vector.slice(0, 3).join(', ')}...]`, // Show first few dimensions
        },
      });
    }
    return results;
  }

  // ==================== Semantic Search ====================

  async semanticSearch(
    clusterId: string,
    indexName: string,
    database: string,
    collection: string,
    searchDto: SemanticSearchDto,
  ): Promise<any[]> {
    // In production, this would:
    // 1. Generate embedding from query text using the configured provider
    // 2. Execute vector search with the embedding
    // 3. Return results

    // For demo, simulate the embedding and search
    const embeddingDimensions = EMBEDDING_DIMENSIONS[searchDto.model || 'text-embedding-3-small'] || 1536;
    const simulatedEmbedding = Array.from({ length: embeddingDimensions }, () => Math.random() * 2 - 1);

    this.logger.log(`Semantic search: "${searchDto.query}" using ${searchDto.embeddingProvider || 'default'} provider`);

    return this.vectorSearch(clusterId, indexName, database, collection, {
      vector: simulatedEmbedding,
      path: 'embedding', // Default path
      limit: searchDto.limit || 10,
      filter: searchDto.filter,
    });
  }

  // ==================== Hybrid Search ====================

  async hybridSearch(
    clusterId: string,
    indexName: string,
    database: string,
    collection: string,
    searchDto: HybridSearchDto,
  ): Promise<any[]> {
    // Hybrid search combines:
    // 1. Vector similarity search
    // 2. Full-text search
    // 3. Weighted combination of scores

    const vectorWeight = searchDto.vectorWeight ?? 0.5;
    const textWeight = 1 - vectorWeight;

    this.logger.log(`Hybrid search: "${searchDto.query}" (vector: ${vectorWeight}, text: ${textWeight})`);

    // Simulate hybrid results
    const limit = searchDto.limit || 10;
    const results = [];

    for (let i = 0; i < limit; i++) {
      const vectorScore = 1 - i * 0.05 - Math.random() * 0.02;
      const textScore = 1 - i * 0.06 - Math.random() * 0.03;
      const combinedScore = vectorScore * vectorWeight + textScore * textWeight;

      results.push({
        _id: new Types.ObjectId().toString(),
        score: combinedScore,
        vectorScore,
        textScore,
        document: {
          title: `Result ${i + 1}: ${searchDto.query.split(' ')[0]}...`,
          content: `Content matching "${searchDto.query.substring(0, 30)}..."`,
          highlights: [`...${searchDto.query}...`],
        },
      });
    }

    // Sort by combined score
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  // ==================== Analyzers ====================

  getAvailableAnalyzers(): any {
    return {
      builtin: BUILT_IN_ANALYZERS,
      charFilters: ['htmlStrip', 'mapping', 'icuNormalize'],
      tokenizers: [
        'standard',
        'letter',
        'whitespace',
        'keyword',
        'nGram',
        'edgeGram',
        'regex',
        'uaxUrlEmail',
      ],
      tokenFilters: [
        'lowercase',
        'uppercase',
        'asciifolding',
        'trim',
        'length',
        'icuFolding',
        'icuNormalizer',
        'nGram',
        'edgeGram',
        'shingle',
        'regex',
        'snowballStemming',
        'stopword',
        'englishPossessive',
        'kStemming',
        'porterStemming',
        'spanishLightStemming',
        'spanishPluralStemming',
        'frenchElision',
        'frenchLightStemming',
        'frenchMinimalStemming',
        'germanLightStemming',
        'germanMinimalStemming',
        'germanNormalization',
      ],
    };
  }

  getEmbeddingModels(): any {
    return {
      openai: [
        { name: 'text-embedding-3-small', dimensions: 1536, description: 'Best for most use cases' },
        { name: 'text-embedding-3-large', dimensions: 3072, description: 'Higher quality, more expensive' },
        { name: 'text-embedding-ada-002', dimensions: 1536, description: 'Legacy model' },
      ],
      cohere: [
        { name: 'embed-english-v3.0', dimensions: 1024, description: 'English only' },
        { name: 'embed-multilingual-v3.0', dimensions: 1024, description: 'Multilingual support' },
      ],
      huggingface: [
        { name: 'all-MiniLM-L6-v2', dimensions: 384, description: 'Fast, good quality' },
        { name: 'all-mpnet-base-v2', dimensions: 768, description: 'Higher quality' },
      ],
    };
  }
}

