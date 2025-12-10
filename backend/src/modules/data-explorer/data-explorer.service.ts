import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db, Collection, ObjectId, Document } from 'mongodb';
import { CredentialsService } from '../credentials/credentials.service';
import { ClustersService } from '../clusters/clusters.service';

export interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
  collections: number;
}

export interface CollectionInfo {
  name: string;
  type: string;
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexes: number;
}

export interface IndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  background?: boolean;
  size: number;
}

export interface QueryResult {
  documents: Document[];
  totalCount: number;
  executionTime: number;
}

@Injectable()
export class DataExplorerService {
  private readonly logger = new Logger(DataExplorerService.name);
  private readonly isDevelopment: boolean;
  private connectionPool: Map<string, { client: MongoClient; lastUsed: Date }> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly clustersService: ClustersService,
  ) {
    this.isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';
    
    // Clean up stale connections every 5 minutes
    setInterval(() => this.cleanupConnections(), 5 * 60 * 1000);
  }

  async getConnection(clusterId: string): Promise<MongoClient> {
    // Check existing connection
    const existing = this.connectionPool.get(clusterId);
    if (existing) {
      existing.lastUsed = new Date();
      return existing.client;
    }

    // Get cluster and credentials
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (cluster.status !== 'ready') {
      throw new BadRequestException({
        code: 'CLUSTER_NOT_READY',
        message: `Cluster is ${cluster.status}. Data Explorer requires a ready cluster.`,
      });
    }

    // In development, connect to local MongoDB
    let connectionString: string;
    if (this.isDevelopment) {
      connectionString = this.configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017');
      this.logger.warn('Development mode: connecting to local MongoDB');
    } else {
      // Get decrypted credentials
      const credentials = await this.credentialsService.getDecrypted(clusterId);
      connectionString = credentials.connectionString;
    }

    // Create connection
    const client = new MongoClient(connectionString, {
      maxPoolSize: 5,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
    });

    await client.connect();

    // Store in pool
    this.connectionPool.set(clusterId, { client, lastUsed: new Date() });
    this.logger.log(`Created new connection for cluster ${clusterId}`);

    return client;
  }

  private cleanupConnections(): void {
    const now = new Date();
    const maxIdle = 10 * 60 * 1000; // 10 minutes

    for (const [clusterId, { client, lastUsed }] of this.connectionPool.entries()) {
      if (now.getTime() - lastUsed.getTime() > maxIdle) {
        client.close().catch((err: Error) => this.logger.error(`Error closing connection: ${err.message}`));
        this.connectionPool.delete(clusterId);
        this.logger.log(`Closed idle connection for cluster ${clusterId}`);
      }
    }
  }

  // ==================== Databases ====================

  async listDatabases(clusterId: string): Promise<DatabaseInfo[]> {
    const client = await this.getConnection(clusterId);
    
    const adminDb = client.db('admin');
    const result = await adminDb.command({ listDatabases: 1 });

    const databases: DatabaseInfo[] = [];
    
    for (const db of result.databases) {
      // Skip system databases
      if (['admin', 'local', 'config'].includes(db.name)) {
        continue;
      }

      const database = client.db(db.name);
      const collections = await database.listCollections().toArray();

      databases.push({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk || 0,
        empty: db.empty || false,
        collections: collections.length,
      });
    }

    return databases;
  }

  async createDatabase(clusterId: string, dbName: string): Promise<void> {
    this.validateName(dbName, 'Database');
    
    const client = await this.getConnection(clusterId);
    const database = client.db(dbName);
    
    // Create a placeholder collection to actually create the database
    await database.createCollection('_placeholder');
    await database.collection('_placeholder').drop();
    
    this.logger.log(`Created database ${dbName} in cluster ${clusterId}`);
  }

  async dropDatabase(clusterId: string, dbName: string): Promise<void> {
    this.validateSystemDb(dbName);
    
    const client = await this.getConnection(clusterId);
    await client.db(dbName).dropDatabase();
    
    this.logger.log(`Dropped database ${dbName} in cluster ${clusterId}`);
  }

  // ==================== Collections ====================

  async listCollections(clusterId: string, dbName: string): Promise<CollectionInfo[]> {
    const client = await this.getConnection(clusterId);
    const database = client.db(dbName);

    const collections = await database.listCollections().toArray();
    const collectionInfos: CollectionInfo[] = [];

    for (const coll of collections) {
      try {
        const stats = await database.command({ collStats: coll.name });
        const indexes = await database.collection(coll.name).indexes();

        collectionInfos.push({
          name: coll.name,
          type: coll.type || 'collection',
          documentCount: stats.count || 0,
          avgDocumentSize: stats.avgObjSize || 0,
          totalSize: stats.size || 0,
          indexes: indexes.length,
        });
      } catch (err) {
        // If stats fail, add basic info
        collectionInfos.push({
          name: coll.name,
          type: coll.type || 'collection',
          documentCount: 0,
          avgDocumentSize: 0,
          totalSize: 0,
          indexes: 0,
        });
      }
    }

    return collectionInfos;
  }

  async createCollection(clusterId: string, dbName: string, collectionName: string): Promise<void> {
    this.validateName(collectionName, 'Collection');
    
    const client = await this.getConnection(clusterId);
    await client.db(dbName).createCollection(collectionName);
    
    this.logger.log(`Created collection ${collectionName} in ${dbName}`);
  }

  async dropCollection(clusterId: string, dbName: string, collectionName: string): Promise<void> {
    const client = await this.getConnection(clusterId);
    await client.db(dbName).collection(collectionName).drop();
    
    this.logger.log(`Dropped collection ${collectionName} in ${dbName}`);
  }

  // ==================== Documents ====================

  async findDocuments(
    clusterId: string,
    dbName: string,
    collectionName: string,
    options: {
      filter?: Record<string, any>;
      sort?: Record<string, 1 | -1>;
      skip?: number;
      limit?: number;
      projection?: Record<string, 0 | 1>;
    } = {},
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    const filter = this.parseFilter(options.filter || {});
    const limit = Math.min(options.limit || 20, 100); // Max 100 documents
    const skip = options.skip || 0;

    const [documents, totalCount] = await Promise.all([
      collection
        .find(filter)
        .sort(options.sort || { _id: -1 })
        .skip(skip)
        .limit(limit)
        .project(options.projection || {})
        .toArray(),
      collection.countDocuments(filter),
    ]);

    const executionTime = Date.now() - startTime;

    return {
      documents: documents.map((doc: Document) => this.serializeDocument(doc)),
      totalCount,
      executionTime,
    };
  }

  async findDocumentById(
    clusterId: string,
    dbName: string,
    collectionName: string,
    documentId: string,
  ): Promise<Document | null> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    let id: any = documentId;
    try {
      id = new ObjectId(documentId);
    } catch {
      // Not a valid ObjectId, use string
    }

    const document = await collection.findOne({ _id: id });
    return document ? this.serializeDocument(document) : null;
  }

  async insertDocument(
    clusterId: string,
    dbName: string,
    collectionName: string,
    document: Record<string, any>,
  ): Promise<{ insertedId: string }> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    // Remove _id if it's empty string
    if (document._id === '' || document._id === null) {
      delete document._id;
    }

    const result = await collection.insertOne(document);
    
    this.logger.log(`Inserted document in ${dbName}.${collectionName}`);
    return { insertedId: result.insertedId.toString() };
  }

  async updateDocument(
    clusterId: string,
    dbName: string,
    collectionName: string,
    documentId: string,
    update: Record<string, any>,
  ): Promise<{ modifiedCount: number }> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    let id: any = documentId;
    try {
      id = new ObjectId(documentId);
    } catch {
      // Not a valid ObjectId, use string
    }

    // Remove _id from update to prevent errors
    delete update._id;

    const result = await collection.replaceOne({ _id: id }, update);
    
    this.logger.log(`Updated document ${documentId} in ${dbName}.${collectionName}`);
    return { modifiedCount: result.modifiedCount };
  }

  async deleteDocument(
    clusterId: string,
    dbName: string,
    collectionName: string,
    documentId: string,
  ): Promise<{ deletedCount: number }> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    let id: any = documentId;
    try {
      id = new ObjectId(documentId);
    } catch {
      // Not a valid ObjectId, use string
    }

    const result = await collection.deleteOne({ _id: id });
    
    this.logger.log(`Deleted document ${documentId} in ${dbName}.${collectionName}`);
    return { deletedCount: result.deletedCount };
  }

  async deleteDocuments(
    clusterId: string,
    dbName: string,
    collectionName: string,
    filter: Record<string, any>,
  ): Promise<{ deletedCount: number }> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    const parsedFilter = this.parseFilter(filter);
    const result = await collection.deleteMany(parsedFilter);
    
    this.logger.log(`Deleted ${result.deletedCount} documents in ${dbName}.${collectionName}`);
    return { deletedCount: result.deletedCount };
  }

  // ==================== Indexes ====================

  async listIndexes(
    clusterId: string,
    dbName: string,
    collectionName: string,
  ): Promise<IndexInfo[]> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    const indexes = await collection.indexes();
    const stats = await collection.aggregate([
      { $indexStats: {} },
    ]).toArray();

    const statsMap = new Map(stats.map((s: any) => [s.name, s]));

    return indexes.map((index: any) => ({
      name: index.name || '',
      key: index.key as Record<string, number>,
      unique: index.unique,
      sparse: index.sparse,
      expireAfterSeconds: index.expireAfterSeconds,
      background: index.background,
      size: (statsMap.get(index.name) as any)?.accesses?.ops || 0,
    }));
  }

  async createIndex(
    clusterId: string,
    dbName: string,
    collectionName: string,
    keys: Record<string, 1 | -1>,
    options: {
      name?: string;
      unique?: boolean;
      sparse?: boolean;
      expireAfterSeconds?: number;
      background?: boolean;
    } = {},
  ): Promise<{ indexName: string }> {
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    const indexName = await collection.createIndex(keys, {
      name: options.name,
      unique: options.unique,
      sparse: options.sparse,
      expireAfterSeconds: options.expireAfterSeconds,
      background: options.background ?? true,
    });

    this.logger.log(`Created index ${indexName} on ${dbName}.${collectionName}`);
    return { indexName };
  }

  async dropIndex(
    clusterId: string,
    dbName: string,
    collectionName: string,
    indexName: string,
  ): Promise<void> {
    if (indexName === '_id_') {
      throw new BadRequestException('Cannot drop the _id index');
    }

    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    await collection.dropIndex(indexName);
    
    this.logger.log(`Dropped index ${indexName} on ${dbName}.${collectionName}`);
  }

  // ==================== Aggregation ====================

  async runAggregation(
    clusterId: string,
    dbName: string,
    collectionName: string,
    pipeline: Document[],
  ): Promise<{ documents: Document[]; executionTime: number }> {
    const startTime = Date.now();
    const client = await this.getConnection(clusterId);
    const collection = client.db(dbName).collection(collectionName);

    // Add $limit if not present to prevent huge result sets
    const hasLimit = pipeline.some(stage => '$limit' in stage);
    if (!hasLimit) {
      pipeline.push({ $limit: 100 });
    }

    const documents = await collection.aggregate(pipeline).toArray();
    const executionTime = Date.now() - startTime;

    return {
      documents: documents.map((doc: Document) => this.serializeDocument(doc)),
      executionTime,
    };
  }

  // ==================== Helpers ====================

  private validateName(name: string, type: string): void {
    if (!name || name.length === 0) {
      throw new BadRequestException(`${type} name is required`);
    }
    if (name.length > 64) {
      throw new BadRequestException(`${type} name must be less than 64 characters`);
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new BadRequestException(`${type} name must start with a letter or underscore and contain only letters, numbers, and underscores`);
    }
  }

  private validateSystemDb(dbName: string): void {
    if (['admin', 'local', 'config'].includes(dbName)) {
      throw new BadRequestException('Cannot modify system databases');
    }
  }

  private parseFilter(filter: Record<string, any>): Record<string, any> {
    const parsed: Record<string, any> = {};

    for (const [key, value] of Object.entries(filter)) {
      if (key === '_id' && typeof value === 'string') {
        try {
          parsed[key] = new ObjectId(value);
        } catch {
          parsed[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        parsed[key] = this.parseFilter(value);
      } else {
        parsed[key] = value;
      }
    }

    return parsed;
  }

  private serializeDocument(doc: Document): Document {
    const serialized: Document = {};

    for (const [key, value] of Object.entries(doc)) {
      if (value instanceof ObjectId) {
        serialized[key] = (value as ObjectId).toString();
      } else if (value instanceof Date) {
        serialized[key] = (value as Date).toISOString();
      } else if (Buffer.isBuffer(value)) {
        serialized[key] = (value as Buffer).toString('base64');
      } else if (typeof value === 'object' && value !== null) {
        serialized[key] = this.serializeDocument(value as Document);
      } else {
        serialized[key] = value;
      }
    }

    return serialized;
  }
}

