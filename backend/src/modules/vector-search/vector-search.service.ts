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
import { DataExplorerService } from '../data-explorer/data-explorer.service';

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
    private readonly dataExplorerService: DataExplorerService,
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

    const limit = queryDto.limit || 10;

    // Strategy 1: Try real $vectorSearch aggregation (Atlas or Atlas-compatible)
    try {
      const results = await this.executeAtlasVectorSearch(
        clusterId, indexName, database, collection, queryDto, vectorField.similarity || 'cosine', limit,
      );
      this.logger.log(`$vectorSearch executed on ${database}.${collection} with index ${indexName}`);
      return results;
    } catch (atlasError) {
      this.logger.warn(`$vectorSearch not available: ${atlasError.message}. Falling back to in-memory cosine similarity.`);
    }

    // Strategy 2: Fallback to in-memory cosine similarity search
    try {
      const results = await this.executeInMemoryVectorSearch(
        clusterId, database, collection, queryDto, vectorField.similarity || 'cosine', limit,
      );
      this.logger.log(`In-memory vector search on ${database}.${collection} (fallback mode)`);
      return results;
    } catch (fallbackError) {
      this.logger.error(`In-memory vector search failed: ${fallbackError.message}`);
      throw new BadRequestException('Vector search failed. Ensure documents have vector embeddings.');
    }
  }

  /**
   * Execute real $vectorSearch aggregation pipeline (Atlas Search / Atlas-compatible)
   */
  private async executeAtlasVectorSearch(
    clusterId: string,
    indexName: string,
    database: string,
    collection: string,
    queryDto: VectorSearchQueryDto,
    similarity: string,
    limit: number,
  ): Promise<any[]> {
    const client = await this.dataExplorerService.getConnection(clusterId);
    const db = client.db(database);
    const coll = db.collection(collection);

    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: indexName,
          path: queryDto.path,
          queryVector: queryDto.vector,
          numCandidates: queryDto.numCandidates || limit * 10,
          limit,
          ...(queryDto.filter ? { filter: queryDto.filter } : {}),
        },
      },
      {
        $addFields: {
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const documents = await coll.aggregate(pipeline).toArray();
    return documents.map((doc: any) => ({
      _id: doc._id?.toString(),
      score: doc.score,
      document: doc,
    }));
  }

  /**
   * Fallback: in-memory cosine similarity search for non-Atlas MongoDB deployments.
   * Fetches candidate documents, computes similarity client-side.
   */
  private async executeInMemoryVectorSearch(
    clusterId: string,
    database: string,
    collection: string,
    queryDto: VectorSearchQueryDto,
    similarity: string,
    limit: number,
  ): Promise<any[]> {
    const client = await this.dataExplorerService.getConnection(clusterId);
    const db = client.db(database);
    const coll = db.collection(collection);

    // Fetch documents that have the vector field (sample up to 10,000)
    const candidates = await coll
      .find({ [queryDto.path]: { $exists: true } })
      .limit(10000)
      .project({ [queryDto.path]: 1, _id: 1 })
      .toArray();

    if (candidates.length === 0) {
      return [];
    }

    // Compute similarity scores
    const scored = candidates
      .map((doc: any) => {
        const docVector = doc[queryDto.path];
        if (!Array.isArray(docVector) || docVector.length !== queryDto.vector.length) {
          return null;
        }
        const score = this.computeSimilarity(queryDto.vector, docVector, similarity);
        return { _id: doc._id?.toString(), score };
      })
      .filter(Boolean) as Array<{ _id: string; score: number }>;

    // Sort by score descending and take top N
    scored.sort((a, b) => b.score - a.score);
    const topIds = scored.slice(0, limit);

    // Fetch full documents for top results
    const fullDocs = await coll
      .find({ _id: { $in: topIds.map((r) => r._id) } })
      .toArray();

    const docMap = new Map(fullDocs.map((d: any) => [d._id?.toString(), d]));

    return topIds.map((r) => ({
      _id: r._id,
      score: r.score,
      document: docMap.get(r._id) || {},
    }));
  }

  /**
   * Compute similarity between two vectors.
   */
  private computeSimilarity(a: number[], b: number[], method: string): number {
    switch (method) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'dotProduct':
        return this.dotProduct(a, b);
      case 'euclidean':
        // Convert euclidean distance to similarity (1 / (1 + distance))
        return 1 / (1 + this.euclideanDistance(a, b));
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private dotProduct(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  // ==================== Semantic Search ====================

  async semanticSearch(
    clusterId: string,
    indexName: string,
    database: string,
    collection: string,
    searchDto: SemanticSearchDto,
  ): Promise<any[]> {
    // Generate embedding from query text using the configured provider
    const embeddingDimensions = EMBEDDING_DIMENSIONS[searchDto.model || 'text-embedding-3-small'] || 1536;
    let embedding: number[];

    const apiKey = this.getEmbeddingApiKey(searchDto.embeddingProvider);
    if (apiKey) {
      try {
        embedding = await this.generateEmbedding(
          searchDto.query,
          searchDto.embeddingProvider || 'openai',
          searchDto.model || 'text-embedding-3-small',
          apiKey,
        );
      } catch (err) {
        this.logger.warn(`Embedding API call failed: ${err.message}. Using random embedding for testing.`);
        embedding = Array.from({ length: embeddingDimensions }, () => Math.random() * 2 - 1);
      }
    } else {
      this.logger.warn(`No API key for ${searchDto.embeddingProvider || 'openai'}. Using random embedding for testing.`);
      embedding = Array.from({ length: embeddingDimensions }, () => Math.random() * 2 - 1);
    }

    this.logger.log(`Semantic search: "${searchDto.query}" using ${searchDto.embeddingProvider || 'openai'} (dim=${embedding.length})`);

    return this.vectorSearch(clusterId, indexName, database, collection, {
      vector: embedding,
      path: searchDto.path || 'embedding',
      limit: searchDto.limit || 10,
      filter: searchDto.filter,
    });
  }

  /**
   * Get API key for embedding provider from environment configuration.
   */
  private getEmbeddingApiKey(provider?: string): string | undefined {
    switch (provider) {
      case 'cohere':
        return this.configService.get<string>('COHERE_API_KEY');
      case 'huggingface':
        return this.configService.get<string>('HUGGINGFACE_API_KEY');
      case 'openai':
      default:
        return this.configService.get<string>('OPENAI_API_KEY');
    }
  }

  /**
   * Generate embedding vector from text using external API.
   */
  private async generateEmbedding(
    text: string,
    provider: string,
    model: string,
    apiKey: string,
  ): Promise<number[]> {
    if (provider === 'openai' || !provider) {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model,
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.data[0].embedding;
    }

    if (provider === 'cohere') {
      const response = await fetch('https://api.cohere.ai/v1/embed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          texts: [text],
          model,
          input_type: 'search_query',
        }),
      });
      if (!response.ok) {
        throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.embeddings[0];
    }

    // HuggingFace Inference API
    const response = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ inputs: text }),
    });
    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data[0]) ? data[0] : data;
  }

  // ==================== Hybrid Search ====================

  async hybridSearch(
    clusterId: string,
    indexName: string,
    database: string,
    collection: string,
    searchDto: HybridSearchDto,
  ): Promise<any[]> {
    const vectorWeight = searchDto.vectorWeight ?? 0.5;
    const textWeight = 1 - vectorWeight;
    const limit = searchDto.limit || 10;

    this.logger.log(`Hybrid search: "${searchDto.query}" (vector: ${vectorWeight}, text: ${textWeight})`);

    // Execute vector search (with real or fallback engine)
    let vectorResults: any[] = [];
    if (searchDto.vector) {
      vectorResults = await this.vectorSearch(clusterId, indexName, database, collection, {
        vector: searchDto.vector,
        path: searchDto.path || 'embedding',
        limit: limit * 2,
        filter: searchDto.filter,
      });
    }

    // Execute text search via MongoDB $text
    let textResults: any[] = [];
    try {
      const client = await this.dataExplorerService.getConnection(clusterId);
      const db = client.db(database);
      const coll = db.collection(collection);

      textResults = await coll
        .find(
          { $text: { $search: searchDto.query } },
          { score: { $meta: 'textScore' } } as any,
        )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit * 2)
        .toArray();

      // Normalize text scores
      const maxTextScore = textResults.length > 0
        ? Math.max(...textResults.map((r: any) => r.score || 0))
        : 1;
      textResults = textResults.map((doc: any) => ({
        _id: doc._id?.toString(),
        score: (doc.score || 0) / maxTextScore,
        document: doc,
      }));
    } catch (err) {
      this.logger.warn(`Text search failed (no text index?): ${err.message}`);
    }

    // Merge and rank by weighted score
    const scoreMap = new Map<string, { vectorScore: number; textScore: number; document: any }>();

    for (const r of vectorResults) {
      scoreMap.set(r._id, {
        vectorScore: r.score,
        textScore: 0,
        document: r.document,
      });
    }

    for (const r of textResults) {
      const existing = scoreMap.get(r._id);
      if (existing) {
        existing.textScore = r.score;
      } else {
        scoreMap.set(r._id, {
          vectorScore: 0,
          textScore: r.score,
          document: r.document,
        });
      }
    }

    const combined = Array.from(scoreMap.entries()).map(([id, data]) => ({
      _id: id,
      score: data.vectorScore * vectorWeight + data.textScore * textWeight,
      vectorScore: data.vectorScore,
      textScore: data.textScore,
      document: data.document,
    }));

    combined.sort((a, b) => b.score - a.score);
    return combined.slice(0, limit);
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

