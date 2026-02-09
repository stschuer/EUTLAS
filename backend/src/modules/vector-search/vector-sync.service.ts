import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QdrantClient } from '@qdrant/js-client-rest';
import { VectorIndex, VectorIndexDocument } from './schemas/vector-index.schema';
import { DataExplorerService } from '../data-explorer/data-explorer.service';
import { ClustersService } from '../clusters/clusters.service';
import { createHash } from 'crypto';
import { ChangeStream } from 'mongodb';

/**
 * VectorSyncService manages the synchronisation of vector data between
 * MongoDB collections and their corresponding Qdrant collections.
 *
 * It supports:
 * - Bulk sync: scans a MongoDB collection and upserts all vectors into Qdrant
 * - Change Stream watchers: real-time sync of insert/update/delete operations
 */
@Injectable()
export class VectorSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(VectorSyncService.name);

  /** Active MongoDB Change Stream watchers keyed by vectorIndex ID */
  private readonly watchers = new Map<string, ChangeStream>();

  /** Cached QdrantClient instances keyed by "host:port" */
  private readonly qdrantClients = new Map<string, QdrantClient>();

  constructor(
    @InjectModel(VectorIndex.name) private vectorIndexModel: Model<VectorIndexDocument>,
    private readonly dataExplorerService: DataExplorerService,
    private readonly clustersService: ClustersService,
  ) {}

  onModuleDestroy() {
    // Close all change stream watchers on shutdown
    for (const [indexId, watcher] of this.watchers.entries()) {
      this.logger.log(`Closing change stream for index ${indexId}`);
      watcher.close().catch(() => {});
    }
    this.watchers.clear();
  }

  // ==================== Qdrant Client Management ====================

  /**
   * Get or create a QdrantClient for the given cluster.
   * Returns null if the cluster does not have vector search enabled.
   */
  async getQdrantClient(clusterId: string): Promise<QdrantClient | null> {
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || !cluster.vectorSearchEnabled || !cluster.vectorDbHost) {
      return null;
    }

    const key = `${cluster.vectorDbHost}:${cluster.vectorDbPort || 6333}`;
    let client = this.qdrantClients.get(key);
    if (!client) {
      client = new QdrantClient({
        url: `http://${cluster.vectorDbHost}:${cluster.vectorDbPort || 6333}`,
        timeout: 30000,
      });
      this.qdrantClients.set(key, client);
    }
    return client;
  }

  // ==================== Qdrant Collection Management ====================

  /**
   * Map our similarity metric names to Qdrant's distance enum.
   */
  private mapSimilarityToDistance(similarity: string): 'Cosine' | 'Euclid' | 'Dot' {
    switch (similarity) {
      case 'cosine':
        return 'Cosine';
      case 'euclidean':
        return 'Euclid';
      case 'dotProduct':
        return 'Dot';
      default:
        return 'Cosine';
    }
  }

  /**
   * Create a Qdrant collection for a VectorIndex.
   * The collection name is derived from the index fields.
   */
  async createQdrantCollection(indexId: string): Promise<void> {
    const index = await this.vectorIndexModel.findById(indexId).exec();
    if (!index) {
      throw new Error(`VectorIndex ${indexId} not found`);
    }

    const client = await this.getQdrantClient(index.clusterId.toString());
    if (!client) {
      this.logger.warn(`No Qdrant client for cluster ${index.clusterId} -- skipping collection creation`);
      return;
    }

    const collectionName = this.getQdrantCollectionName(index);

    try {
      // Check if collection already exists
      const collections = await client.getCollections();
      const exists = collections.collections.some((c) => c.name === collectionName);

      if (exists) {
        this.logger.log(`Qdrant collection "${collectionName}" already exists`);
        return;
      }

      // Use the first vector field as the default (unnamed) vector
      // Additional vector fields become named vectors
      const primaryField = index.vectorFields[0];

      if (index.vectorFields.length === 1) {
        // Single vector field -- use default (unnamed) vector config
        await client.createCollection(collectionName, {
          vectors: {
            size: primaryField.dimensions,
            distance: this.mapSimilarityToDistance(primaryField.similarity),
          },
          hnsw_config: {
            m: 16,
            ef_construct: 128,
          },
          optimizers_config: {
            indexing_threshold: 20000,
          },
        });
      } else {
        // Multiple vector fields -- use named vectors
        const vectorsConfig: Record<string, { size: number; distance: 'Cosine' | 'Euclid' | 'Dot' }> = {};
        for (const field of index.vectorFields) {
          const fieldKey = field.path.replace(/\./g, '_');
          vectorsConfig[fieldKey] = {
            size: field.dimensions,
            distance: this.mapSimilarityToDistance(field.similarity),
          };
        }
        await client.createCollection(collectionName, {
          vectors: vectorsConfig,
          hnsw_config: {
            m: 16,
            ef_construct: 128,
          },
          optimizers_config: {
            indexing_threshold: 20000,
          },
        });
      }

      // Create payload indexes for filter fields
      if (index.filterFields && index.filterFields.length > 0) {
        for (const filter of index.filterFields) {
          const fieldKey = filter.path.replace(/\./g, '_');
          const schemaType = this.mapFilterTypeToQdrant(filter.type);
          await client.createPayloadIndex(collectionName, {
            field_name: fieldKey,
            field_schema: schemaType,
          });
        }
      }

      this.logger.log(`Created Qdrant collection "${collectionName}" with ${index.vectorFields.length} vector field(s)`);
    } catch (error: any) {
      this.logger.error(`Failed to create Qdrant collection "${collectionName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a Qdrant collection for a VectorIndex.
   */
  async deleteQdrantCollection(indexId: string): Promise<void> {
    const index = await this.vectorIndexModel.findById(indexId).exec();
    if (!index) return;

    const client = await this.getQdrantClient(index.clusterId.toString());
    if (!client) return;

    const collectionName = this.getQdrantCollectionName(index);

    // Stop the change stream watcher if active
    this.stopWatcher(indexId);

    try {
      await client.deleteCollection(collectionName);
      this.logger.log(`Deleted Qdrant collection "${collectionName}"`);
    } catch (error: any) {
      if (!error.message?.includes('not found')) {
        this.logger.warn(`Failed to delete Qdrant collection "${collectionName}": ${error.message}`);
      }
    }
  }

  /**
   * Get real collection stats from Qdrant.
   */
  async getCollectionStats(indexId: string): Promise<{ pointCount: number; indexSizeBytes: number } | null> {
    const index = await this.vectorIndexModel.findById(indexId).exec();
    if (!index) return null;

    const client = await this.getQdrantClient(index.clusterId.toString());
    if (!client) return null;

    const collectionName = this.getQdrantCollectionName(index);

    try {
      const info = await client.getCollection(collectionName);
      return {
        pointCount: info.points_count || 0,
        indexSizeBytes: (info.points_count || 0) * (index.vectorFields[0]?.dimensions || 128) * 4,
      };
    } catch {
      return null;
    }
  }

  // ==================== Bulk Sync ====================

  /**
   * Bulk sync all documents with vector fields from a MongoDB collection into Qdrant.
   * Processes in batches of `batchSize`.
   */
  async bulkSync(indexId: string, batchSize = 1000): Promise<{ synced: number; errors: number }> {
    const index = await this.vectorIndexModel.findById(indexId).exec();
    if (!index) {
      throw new Error(`VectorIndex ${indexId} not found`);
    }

    const client = await this.getQdrantClient(index.clusterId.toString());
    if (!client) {
      throw new Error(`No Qdrant client available for cluster ${index.clusterId}`);
    }

    const collectionName = this.getQdrantCollectionName(index);
    const primaryField = index.vectorFields[0];

    // Get MongoDB connection
    const mongoClient = await this.dataExplorerService.getConnection(index.clusterId.toString());
    const db = mongoClient.db(index.database);
    const coll = db.collection(index.collection);

    let synced = 0;
    let errors = 0;

    // Use cursor-based iteration for large collections
    const cursor = coll.find({ [primaryField.path]: { $exists: true } }).batchSize(batchSize);

    let batch: any[] = [];

    for await (const doc of cursor) {
      const vector = doc[primaryField.path];
      if (!Array.isArray(vector) || vector.length !== primaryField.dimensions) {
        errors++;
        continue;
      }

      const pointId = this.mongoIdToQdrantId(doc._id.toString());

      // Build payload from filter fields
      const payload: Record<string, any> = {
        _mongo_id: doc._id.toString(),
      };
      if (index.filterFields) {
        for (const filter of index.filterFields) {
          const val = this.getNestedValue(doc, filter.path);
          if (val !== undefined) {
            payload[filter.path.replace(/\./g, '_')] = val;
          }
        }
      }

      if (index.vectorFields.length === 1) {
        batch.push({
          id: pointId,
          vector,
          payload,
        });
      } else {
        // Named vectors
        const vectors: Record<string, number[]> = {};
        for (const field of index.vectorFields) {
          const v = doc[field.path];
          if (Array.isArray(v) && v.length === field.dimensions) {
            vectors[field.path.replace(/\./g, '_')] = v;
          }
        }
        batch.push({
          id: pointId,
          vector: vectors,
          payload,
        });
      }

      if (batch.length >= batchSize) {
        try {
          await client.upsert(collectionName, { points: batch, wait: true });
          synced += batch.length;
        } catch (err: any) {
          this.logger.error(`Batch upsert failed: ${err.message}`);
          errors += batch.length;
        }
        batch = [];
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      try {
        await client.upsert(collectionName, { points: batch, wait: true });
        synced += batch.length;
      } catch (err: any) {
        this.logger.error(`Final batch upsert failed: ${err.message}`);
        errors += batch.length;
      }
    }

    // Update index stats
    await this.vectorIndexModel.updateOne(
      { _id: indexId },
      { documentCount: synced, indexSizeBytes: synced * primaryField.dimensions * 4 },
    ).exec();

    this.logger.log(`Bulk sync complete for index ${indexId}: ${synced} synced, ${errors} errors`);
    return { synced, errors };
  }

  // ==================== Change Stream Watcher ====================

  /**
   * Start a MongoDB Change Stream watcher for a vector index.
   * Watches the source collection and syncs changes to Qdrant in real-time.
   */
  async startWatcher(indexId: string): Promise<void> {
    if (this.watchers.has(indexId)) {
      this.logger.debug(`Watcher already active for index ${indexId}`);
      return;
    }

    const index = await this.vectorIndexModel.findById(indexId).exec();
    if (!index) return;

    const client = await this.getQdrantClient(index.clusterId.toString());
    if (!client) {
      this.logger.warn(`Cannot start watcher for index ${indexId}: no Qdrant client`);
      return;
    }

    try {
      const mongoClient = await this.dataExplorerService.getConnection(index.clusterId.toString());
      const db = mongoClient.db(index.database);
      const coll = db.collection(index.collection);

      const collectionName = this.getQdrantCollectionName(index);
      const primaryField = index.vectorFields[0];

      const changeStream = coll.watch([], { fullDocument: 'updateLookup' });
      this.watchers.set(indexId, changeStream);

      changeStream.on('change', async (change: any) => {
        try {
          if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
            const doc = change.fullDocument;
            if (!doc) return;

            const vector = doc[primaryField.path];
            if (!Array.isArray(vector) || vector.length !== primaryField.dimensions) return;

            const pointId = this.mongoIdToQdrantId(doc._id.toString());
            const payload: Record<string, any> = { _mongo_id: doc._id.toString() };

            if (index.filterFields) {
              for (const filter of index.filterFields) {
                const val = this.getNestedValue(doc, filter.path);
                if (val !== undefined) {
                  payload[filter.path.replace(/\./g, '_')] = val;
                }
              }
            }

            await client.upsert(collectionName, {
              points: [{ id: pointId, vector, payload }],
              wait: false,
            });
          } else if (change.operationType === 'delete') {
            const docId = change.documentKey?._id?.toString();
            if (!docId) return;

            const pointId = this.mongoIdToQdrantId(docId);
            await client.delete(collectionName, {
              points: [pointId],
              wait: false,
            });
          }
        } catch (err: any) {
          this.logger.warn(`Change stream sync error for index ${indexId}: ${err.message}`);
        }
      });

      changeStream.on('error', (err: any) => {
        this.logger.error(`Change stream error for index ${indexId}: ${err.message}`);
        this.watchers.delete(indexId);
      });

      this.logger.log(`Started change stream watcher for index ${indexId} on ${index.database}.${index.collection}`);
    } catch (err: any) {
      this.logger.error(`Failed to start watcher for index ${indexId}: ${err.message}`);
    }
  }

  /**
   * Stop a change stream watcher for a vector index.
   */
  stopWatcher(indexId: string): void {
    const watcher = this.watchers.get(indexId);
    if (watcher) {
      watcher.close().catch(() => {});
      this.watchers.delete(indexId);
      this.logger.log(`Stopped change stream watcher for index ${indexId}`);
    }
  }

  // ==================== Helpers ====================

  /**
   * Derive the Qdrant collection name from a VectorIndex.
   * Format: {database}_{collection}_{indexName}
   */
  getQdrantCollectionName(index: VectorIndex | VectorIndexDocument): string {
    return `${index.database}_${index.collection}_${index.name}`
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 255);
  }

  /**
   * Convert a MongoDB ObjectId string into a deterministic unsigned integer
   * suitable for use as a Qdrant point ID.
   */
  private mongoIdToQdrantId(mongoId: string): number {
    const hash = createHash('sha256').update(mongoId).digest();
    // Use first 6 bytes to get a positive integer within JS safe range
    return hash.readUIntBE(0, 6);
  }

  /**
   * Map our filter field type to a Qdrant payload schema type.
   */
  private mapFilterTypeToQdrant(type: string): 'keyword' | 'integer' | 'float' | 'bool' | 'datetime' {
    switch (type) {
      case 'string':
      case 'objectId':
        return 'keyword';
      case 'number':
        return 'float';
      case 'boolean':
        return 'bool';
      case 'date':
        return 'datetime';
      default:
        return 'keyword';
    }
  }

  /**
   * Safely get a nested value from an object by dot-notation path.
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }
}
