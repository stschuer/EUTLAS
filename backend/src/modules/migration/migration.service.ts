import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EventsService } from '../events/events.service';
import { ClustersService } from '../clusters/clusters.service';
import { JobsService } from '../jobs/jobs.service';
import {
  Migration,
  MigrationDocument,
  MigrationStatus,
} from './schemas/migration.schema';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @InjectModel(Migration.name)
    private readonly migrationModel: Model<MigrationDocument>,
    private readonly configService: ConfigService,
    private readonly eventsService: EventsService,
    private readonly clustersService: ClustersService,
    private readonly jobsService: JobsService,
  ) {}

  // ================================================================
  // Step 1: Validate & Analyze Source
  // ================================================================

  /**
   * Connect to a source MongoDB, verify connectivity, and return
   * a detailed analysis of all databases, collections, indexes, and sizes.
   */
  async analyzeSource(sourceUri: string): Promise<{
    valid: boolean;
    mongoVersion?: string;
    replicaSet?: boolean;
    replicaSetName?: string;
    databases?: Array<{
      name: string;
      sizeOnDisk: number;
      collections: number;
      indexes: number;
      documents: number;
    }>;
    totalSizeBytes?: number;
    totalDocuments?: number;
    totalCollections?: number;
    totalIndexes?: number;
    estimatedMigrationTimeSec?: number;
    warnings?: string[];
    error?: string;
  }> {
    let client: any;
    try {
      const { MongoClient } = require('mongodb');
      client = new MongoClient(sourceUri, {
        connectTimeoutMS: 15000,
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 30000,
      });

      await client.connect();
      const adminDb = client.db('admin');

      // Get server version
      const buildInfo = await adminDb.command({ buildInfo: 1 });
      const mongoVersion = buildInfo.version;

      // Check replica set status
      let replicaSet = false;
      let replicaSetName: string | undefined;
      try {
        const replStatus = await adminDb.command({ replSetGetStatus: 1 });
        replicaSet = true;
        replicaSetName = replStatus.set;
      } catch {
        // Not a replica set -- that's fine
      }

      // List databases
      const listDbs = await adminDb.command({ listDatabases: 1 });
      const systemDbs = ['admin', 'local', 'config'];
      const warnings: string[] = [];

      // Check version compatibility
      const majorVersion = parseInt(mongoVersion.split('.')[0], 10);
      if (majorVersion < 5) {
        warnings.push(
          `Source MongoDB ${mongoVersion} is older than 5.0. Some features may not migrate perfectly.`,
        );
      }

      // Analyze each database in detail
      const databases: Array<{
        name: string;
        sizeOnDisk: number;
        collections: number;
        indexes: number;
        documents: number;
      }> = [];

      let totalDocuments = 0;
      let totalCollections = 0;
      let totalIndexes = 0;

      for (const dbInfo of listDbs.databases) {
        if (systemDbs.includes(dbInfo.name)) continue;

        const db = client.db(dbInfo.name);
        const collections = await db.listCollections().toArray();
        let dbDocuments = 0;
        let dbIndexes = 0;

        for (const coll of collections) {
          try {
            const stats = await db.command({
              collStats: coll.name,
              scale: 1,
            });
            dbDocuments += stats.count || 0;
            dbIndexes += stats.nindexes || 0;
          } catch {
            // Some collections may not support collStats (e.g., views)
            try {
              const count = await db.collection(coll.name).estimatedDocumentCount();
              dbDocuments += count;
              dbIndexes += 1; // At least _id index
            } catch {
              // Skip entirely
            }
          }
        }

        databases.push({
          name: dbInfo.name,
          sizeOnDisk: dbInfo.sizeOnDisk || 0,
          collections: collections.length,
          indexes: dbIndexes,
          documents: dbDocuments,
        });

        totalDocuments += dbDocuments;
        totalCollections += collections.length;
        totalIndexes += dbIndexes;
      }

      const totalSizeBytes = listDbs.totalSize || 0;

      // Estimate migration time (rough: ~50MB/s for dump+restore over network)
      const transferRateBps = 50 * 1024 * 1024; // 50 MB/s
      const estimatedMigrationTimeSec = Math.max(
        30,
        Math.ceil(totalSizeBytes / transferRateBps) * 2, // x2 for dump + restore
      );

      if (totalSizeBytes > 100 * 1024 * 1024 * 1024) {
        // > 100GB
        warnings.push(
          'Large dataset detected (>100GB). Migration may take several hours. Consider migrating during off-peak hours.',
        );
      }

      await client.close();

      return {
        valid: true,
        mongoVersion,
        replicaSet,
        replicaSetName,
        databases,
        totalSizeBytes,
        totalDocuments,
        totalCollections,
        totalIndexes,
        estimatedMigrationTimeSec,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error: any) {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore close errors
        }
      }

      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.message?.includes('ENOTFOUND')) {
        errorMessage =
          'Could not resolve hostname. Please check the connection URI.';
      } else if (error.message?.includes('ECONNREFUSED')) {
        errorMessage =
          'Connection refused. Make sure the source MongoDB is accessible from the internet and the port is open.';
      } else if (error.message?.includes('Authentication failed')) {
        errorMessage =
          'Authentication failed. Please check username and password in the URI.';
      } else if (error.message?.includes('SSL')) {
        errorMessage =
          'TLS/SSL connection error. Try adding ?tls=true or ?ssl=true to your URI.';
      } else if (error.message?.includes('timed out')) {
        errorMessage =
          'Connection timed out. Make sure the source MongoDB allows connections from external IPs. If using Atlas, add 0.0.0.0/0 to the IP Access List temporarily.';
      }

      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  // ================================================================
  // Step 2: Start Migration
  // ================================================================

  /**
   * Start a full migration from a source MongoDB to an EUTLAS cluster.
   * Creates a persistent Migration record and enqueues a background job.
   */
  async startMigration(params: {
    sourceUri: string;
    sourceProvider: string;
    targetClusterId: string;
    projectId: string;
    orgId: string;
    userId: string;
    databases?: string[];
    excludeDatabases?: string[];
    collections?: string[];
    options?: {
      dropExisting?: boolean;
      preserveUUIDs?: boolean;
      numParallelCollections?: number;
      oplogReplay?: boolean;
      includeIndexes?: boolean;
      includeGridFS?: boolean;
      compressTransfer?: boolean;
    };
  }): Promise<MigrationDocument> {
    // Validate target cluster
    const cluster = await this.clustersService.findById(params.targetClusterId);
    if (!cluster) {
      throw new NotFoundException('Target cluster not found');
    }
    if (cluster.status !== 'ready') {
      throw new BadRequestException(
        `Target cluster must be in "ready" state (current: ${cluster.status})`,
      );
    }

    // Check no other active migration for this cluster
    const activeMigration = await this.migrationModel.findOne({
      targetClusterId: new Types.ObjectId(params.targetClusterId),
      status: { $in: ['pending', 'validating', 'analyzing', 'dumping', 'restoring', 'verifying'] },
    });
    if (activeMigration) {
      throw new BadRequestException(
        `A migration is already in progress for this cluster (${activeMigration.id}, status: ${activeMigration.status}). Cancel it first or wait for it to complete.`,
      );
    }

    // Analyze source first
    const analysis = await this.analyzeSource(params.sourceUri);
    if (!analysis.valid) {
      throw new BadRequestException(
        `Cannot connect to source MongoDB: ${analysis.error}`,
      );
    }

    // Filter databases based on user selection
    let databasesToMigrate = analysis.databases || [];
    if (params.databases?.length) {
      databasesToMigrate = databasesToMigrate.filter((db) =>
        params.databases!.includes(db.name),
      );
    }
    if (params.excludeDatabases?.length) {
      databasesToMigrate = databasesToMigrate.filter(
        (db) => !params.excludeDatabases!.includes(db.name),
      );
    }

    if (databasesToMigrate.length === 0) {
      throw new BadRequestException(
        'No databases to migrate after applying filters. Check your database selection.',
      );
    }

    // Create the migration record
    const migration = await this.migrationModel.create({
      targetClusterId: new Types.ObjectId(params.targetClusterId),
      targetProjectId: new Types.ObjectId(params.projectId),
      targetOrgId: new Types.ObjectId(params.orgId),
      sourceUri: params.sourceUri,
      sourceProvider: params.sourceProvider,
      status: 'pending',
      progress: 0,
      currentStep: 'Queued for processing',
      sourceInfo: {
        mongoVersion: analysis.mongoVersion,
        replicaSet: analysis.replicaSet,
        replicaSetName: analysis.replicaSetName,
        totalSizeBytes: analysis.totalSizeBytes,
        databases: databasesToMigrate,
      },
      databases: params.databases,
      excludeDatabases: params.excludeDatabases,
      collections: params.collections,
      options: {
        dropExisting: params.options?.dropExisting ?? true,
        preserveUUIDs: params.options?.preserveUUIDs ?? false,
        numParallelCollections: params.options?.numParallelCollections ?? 4,
        oplogReplay: params.options?.oplogReplay ?? false,
        includeIndexes: params.options?.includeIndexes ?? true,
        includeGridFS: params.options?.includeGridFS ?? true,
        compressTransfer: params.options?.compressTransfer ?? true,
      },
      databaseProgress: databasesToMigrate.map((db) => ({
        name: db.name,
        status: 'pending',
        collectionsTotal: db.collections,
        collectionsCompleted: 0,
        documentsTotal: db.documents,
        documentsCompleted: 0,
        sizeBytes: db.sizeOnDisk,
        transferredBytes: 0,
      })),
      stats: {
        totalDatabases: databasesToMigrate.length,
        totalCollections: databasesToMigrate.reduce((sum, db) => sum + db.collections, 0),
        totalDocuments: databasesToMigrate.reduce((sum, db) => sum + db.documents, 0),
        totalIndexes: databasesToMigrate.reduce((sum, db) => sum + db.indexes, 0),
        totalSizeBytes: databasesToMigrate.reduce((sum, db) => sum + db.sizeOnDisk, 0),
        transferredBytes: 0,
        databasesCompleted: 0,
        collectionsCompleted: 0,
        documentsRestored: 0,
        indexesRestored: 0,
      },
      log: [
        {
          timestamp: new Date(),
          level: 'info',
          message: `Migration created: ${databasesToMigrate.length} databases, ~${this.formatBytes(analysis.totalSizeBytes || 0)} total`,
        },
      ],
      createdBy: params.userId,
    });

    // Create a background job
    const job = await this.jobsService.createJob({
      type: 'MIGRATE_CLUSTER',
      targetClusterId: params.targetClusterId,
      targetProjectId: params.projectId,
      targetOrgId: params.orgId,
      payload: {
        migrationId: migration.id,
        sourceUri: params.sourceUri,
        databases: databasesToMigrate.map((db) => db.name),
        collections: params.collections,
        options: migration.options,
      },
    });

    // Store the job reference
    await this.migrationModel.findByIdAndUpdate(migration.id, {
      jobId: (job as any)._id || job.id,
    });

    await this.eventsService.createEvent({
      orgId: params.orgId,
      projectId: params.projectId,
      clusterId: params.targetClusterId,
      type: 'MIGRATION_STARTED' as any,
      severity: 'info',
      message: `Migration from ${params.sourceProvider} started: ${databasesToMigrate.length} databases, ~${this.formatBytes(analysis.totalSizeBytes || 0)}`,
      metadata: { migrationId: migration.id },
    });

    this.logger.log(
      `Migration ${migration.id} started: ${params.sourceProvider} -> cluster ${params.targetClusterId} (${databasesToMigrate.length} databases)`,
    );

    return migration;
  }

  // ================================================================
  // Step 3: Execute Migration (called by JobProcessor)
  // ================================================================

  /**
   * Execute the actual migration. This is called by the JobProcessorService.
   * It connects to the source, dumps each database, and restores to the target.
   */
  async executeMigration(migrationId: string): Promise<void> {
    const migration = await this.migrationModel.findById(migrationId);
    if (!migration) {
      throw new NotFoundException('Migration not found');
    }

    try {
      // Phase 1: Validating
      await this.updateMigrationStatus(migrationId, 'validating', 5, 'Validating source connection...');

      const { MongoClient } = require('mongodb');
      const sourceClient = new MongoClient(migration.sourceUri, {
        connectTimeoutMS: 30000,
        serverSelectionTimeoutMS: 30000,
      });
      await sourceClient.connect();
      await this.addLog(migrationId, 'info', 'Source connection validated');

      // Phase 2: Get target connection info
      await this.updateMigrationStatus(migrationId, 'analyzing', 10, 'Analyzing target cluster...');

      const targetCluster = await this.clustersService.findByIdWithCredentials(
        migration.targetClusterId.toString(),
      );
      if (!targetCluster || !targetCluster.credentials?.connectionString) {
        throw new Error('Cannot get target cluster connection information');
      }

      const targetClient = new MongoClient(targetCluster.credentials.connectionString, {
        connectTimeoutMS: 30000,
        serverSelectionTimeoutMS: 30000,
      });
      await targetClient.connect();
      await this.addLog(migrationId, 'info', 'Target cluster connection established');

      // Phase 3: Migrate each database
      const databases = migration.sourceInfo?.databases || [];
      const totalDbs = databases.length;
      let completedDbs = 0;

      for (const dbInfo of databases) {
        const dbName = dbInfo.name;
        const baseProgress = 15 + Math.floor((completedDbs / totalDbs) * 70); // 15-85% range

        await this.updateMigrationStatus(
          migrationId,
          'dumping',
          baseProgress,
          `Migrating database: ${dbName} (${completedDbs + 1}/${totalDbs})`,
        );
        await this.updateDbProgress(migrationId, dbName, 'dumping');

        try {
          const sourceDb = sourceClient.db(dbName);
          const targetDb = targetClient.db(dbName);

          // Get all collections
          const collections = await sourceDb.listCollections().toArray();
          let collectionsCompleted = 0;

          // Filter collections if user specified specific ones
          let collectionsToMigrate = collections;
          if (migration.collections?.length) {
            collectionsToMigrate = collections.filter((c: any) =>
              migration.collections!.some(
                (fc: string) => fc === `${dbName}.${c.name}` || fc === c.name,
              ),
            );
          }
          if (migration.excludeCollections?.length) {
            collectionsToMigrate = collectionsToMigrate.filter(
              (c: any) =>
                !migration.excludeCollections!.some(
                  (ec: string) => ec === `${dbName}.${c.name}` || ec === c.name,
                ),
            );
          }

          for (const collInfo of collectionsToMigrate) {
            const collName = collInfo.name;

            // Skip system collections
            if (collName.startsWith('system.')) continue;

            await this.addLog(migrationId, 'info', `  Migrating ${dbName}.${collName}...`);

            try {
              const sourceColl = sourceDb.collection(collName);
              const targetColl = targetDb.collection(collName);

              // Drop existing if configured
              if (migration.options?.dropExisting) {
                try {
                  await targetColl.drop();
                } catch {
                  // Collection may not exist -- that's fine
                }
              }

              // Migrate documents in batches
              const batchSize = 1000;
              let cursor = sourceColl.find({}).batchSize(batchSize);
              let batch: any[] = [];
              let docCount = 0;

              for await (const doc of cursor) {
                batch.push(doc);
                if (batch.length >= batchSize) {
                  await targetColl.insertMany(batch, { ordered: false });
                  docCount += batch.length;
                  batch = [];

                  // Update progress periodically
                  if (docCount % 10000 === 0) {
                    await this.addLog(
                      migrationId,
                      'info',
                      `  ${dbName}.${collName}: ${docCount.toLocaleString()} documents migrated`,
                    );
                  }
                }
              }

              // Insert remaining batch
              if (batch.length > 0) {
                await targetColl.insertMany(batch, { ordered: false });
                docCount += batch.length;
              }

              // Migrate indexes
              if (migration.options?.includeIndexes !== false) {
                try {
                  const indexes = await sourceColl.indexes();
                  for (const idx of indexes) {
                    if (idx.name === '_id_') continue; // Skip default _id index
                    try {
                      const { key, ...indexOptions } = idx;
                      delete (indexOptions as any).v;
                      delete (indexOptions as any).ns;
                      await targetColl.createIndex(key, indexOptions);
                    } catch (indexErr: any) {
                      await this.addLog(
                        migrationId,
                        'warn',
                        `  Warning: Could not create index ${idx.name} on ${dbName}.${collName}: ${indexErr.message}`,
                      );
                    }
                  }
                } catch (indexErr: any) {
                  await this.addLog(
                    migrationId,
                    'warn',
                    `  Warning: Could not read indexes for ${dbName}.${collName}: ${indexErr.message}`,
                  );
                }
              }

              collectionsCompleted++;
              await this.addLog(
                migrationId,
                'info',
                `  Completed ${dbName}.${collName}: ${docCount.toLocaleString()} documents`,
              );

              // Update per-database progress
              await this.migrationModel.findOneAndUpdate(
                { _id: migrationId, 'databaseProgress.name': dbName },
                {
                  $set: {
                    'databaseProgress.$.collectionsCompleted': collectionsCompleted,
                    'databaseProgress.$.documentsCompleted':
                      (await this.getDbProgressDocs(migrationId, dbName)) + docCount,
                  },
                  $inc: { 'stats.collectionsCompleted': 1, 'stats.documentsRestored': docCount },
                },
              );
            } catch (collErr: any) {
              await this.addLog(
                migrationId,
                'error',
                `  Error migrating ${dbName}.${collName}: ${collErr.message}`,
              );
              // Continue with next collection
            }
          }

          completedDbs++;
          await this.updateDbProgress(migrationId, dbName, 'completed');
          await this.migrationModel.findByIdAndUpdate(migrationId, {
            $inc: { 'stats.databasesCompleted': 1 },
          });

          await this.addLog(
            migrationId,
            'info',
            `Database ${dbName} completed (${completionsLabel(collectionsCompleted, collectionsToMigrate.length)})`,
          );
        } catch (dbErr: any) {
          await this.updateDbProgress(migrationId, dbName, 'failed', dbErr.message);
          await this.addLog(
            migrationId,
            'error',
            `Database ${dbName} failed: ${dbErr.message}`,
          );
          // Continue with next database
        }
      }

      // Phase 4: Verification
      await this.updateMigrationStatus(migrationId, 'verifying', 90, 'Verifying migration...');
      await this.addLog(migrationId, 'info', 'Starting verification...');

      const verificationResult = await this.verifyMigration(
        sourceClient,
        targetClient,
        databases.map((d) => d.name),
      );

      await this.migrationModel.findByIdAndUpdate(migrationId, {
        verification: verificationResult,
      });

      // Close connections
      await sourceClient.close();
      await targetClient.close();

      // Phase 5: Complete
      const updatedMigration = await this.migrationModel.findById(migrationId);
      const startedAt = updatedMigration?.stats?.startedAt || updatedMigration?.createdAt;
      const durationMs = startedAt
        ? Date.now() - new Date(startedAt).getTime()
        : 0;

      await this.migrationModel.findByIdAndUpdate(migrationId, {
        status: 'completed',
        progress: 100,
        currentStep: 'Migration completed successfully',
        'stats.completedAt': new Date(),
        'stats.durationMs': durationMs,
      });

      await this.addLog(
        migrationId,
        'info',
        `Migration completed in ${this.formatDuration(durationMs)}. Verification: ${verificationResult.passed ? 'PASSED' : 'ISSUES DETECTED'}`,
      );

      // Fire completion event
      await this.eventsService.createEvent({
        orgId: migration.targetOrgId.toString(),
        projectId: migration.targetProjectId.toString(),
        clusterId: migration.targetClusterId.toString(),
        type: 'MIGRATION_COMPLETED' as any,
        severity: 'info',
        message: `Migration completed: ${completedDbs}/${totalDbs} databases migrated in ${this.formatDuration(durationMs)}`,
        metadata: {
          migrationId,
          verification: verificationResult.passed,
        },
      });
    } catch (error: any) {
      await this.migrationModel.findByIdAndUpdate(migrationId, {
        status: 'failed',
        currentStep: `Failed: ${error.message}`,
        errorMessage: error.message,
      });

      await this.addLog(migrationId, 'error', `Migration failed: ${error.message}`);

      await this.eventsService.createEvent({
        orgId: migration.targetOrgId.toString(),
        projectId: migration.targetProjectId.toString(),
        clusterId: migration.targetClusterId.toString(),
        type: 'MIGRATION_FAILED' as any,
        severity: 'error',
        message: `Migration failed: ${error.message}`,
        metadata: { migrationId },
      });

      throw error;
    }
  }

  // ================================================================
  // Verification
  // ================================================================

  private async verifyMigration(
    sourceClient: any,
    targetClient: any,
    databaseNames: string[],
  ): Promise<{
    passed: boolean;
    checkedAt: Date;
    databaseChecks: Array<{
      name: string;
      sourceDocCount: number;
      targetDocCount: number;
      match: boolean;
      collectionChecks: Array<{
        name: string;
        sourceCount: number;
        targetCount: number;
        match: boolean;
      }>;
    }>;
  }> {
    const databaseChecks: any[] = [];
    let allPassed = true;

    for (const dbName of databaseNames) {
      const sourceDb = sourceClient.db(dbName);
      const targetDb = targetClient.db(dbName);

      const sourceColls = await sourceDb.listCollections().toArray();
      let sourceTotal = 0;
      let targetTotal = 0;
      const collectionChecks: any[] = [];

      for (const coll of sourceColls) {
        if (coll.name.startsWith('system.')) continue;

        try {
          const sourceCount = await sourceDb
            .collection(coll.name)
            .estimatedDocumentCount();
          let targetCount = 0;
          try {
            targetCount = await targetDb
              .collection(coll.name)
              .estimatedDocumentCount();
          } catch {
            // Collection may not exist in target
          }

          sourceTotal += sourceCount;
          targetTotal += targetCount;

          // Allow 1% tolerance for timing differences
          const match =
            targetCount >= sourceCount * 0.99 &&
            targetCount <= sourceCount * 1.01;

          if (!match) allPassed = false;

          collectionChecks.push({
            name: coll.name,
            sourceCount,
            targetCount,
            match,
          });
        } catch {
          // Skip problematic collections
        }
      }

      const dbMatch =
        targetTotal >= sourceTotal * 0.99 &&
        targetTotal <= sourceTotal * 1.01;
      if (!dbMatch) allPassed = false;

      databaseChecks.push({
        name: dbName,
        sourceDocCount: sourceTotal,
        targetDocCount: targetTotal,
        match: dbMatch,
        collectionChecks,
      });
    }

    return {
      passed: allPassed,
      checkedAt: new Date(),
      databaseChecks,
    };
  }

  // ================================================================
  // CRUD Operations
  // ================================================================

  async getMigration(migrationId: string): Promise<MigrationDocument | null> {
    return this.migrationModel.findById(migrationId);
  }

  async listMigrations(
    targetClusterId?: string,
    orgId?: string,
  ): Promise<MigrationDocument[]> {
    const filter: any = {};
    if (targetClusterId) {
      filter.targetClusterId = new Types.ObjectId(targetClusterId);
    }
    if (orgId) {
      filter.targetOrgId = new Types.ObjectId(orgId);
    }
    return this.migrationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50);
  }

  async cancelMigration(migrationId: string): Promise<MigrationDocument> {
    const migration = await this.migrationModel.findById(migrationId);
    if (!migration) {
      throw new NotFoundException('Migration not found');
    }
    if (['completed', 'failed', 'cancelled'].includes(migration.status)) {
      throw new BadRequestException(
        `Cannot cancel migration in "${migration.status}" state`,
      );
    }

    // Cancel the associated job if it exists
    if (migration.jobId) {
      try {
        await this.jobsService.cancelJob(migration.jobId.toString());
      } catch {
        // Job may already be completed
      }
    }

    const updated = await this.migrationModel.findByIdAndUpdate(
      migrationId,
      {
        status: 'cancelled',
        currentStep: 'Cancelled by user',
        $push: {
          log: {
            timestamp: new Date(),
            level: 'info',
            message: 'Migration cancelled by user',
          },
        },
      },
      { new: true },
    );

    await this.eventsService.createEvent({
      orgId: migration.targetOrgId.toString(),
      projectId: migration.targetProjectId.toString(),
      clusterId: migration.targetClusterId.toString(),
      type: 'MIGRATION_CANCELLED' as any,
      severity: 'info',
      message: 'Migration cancelled by user',
      metadata: { migrationId },
    });

    return updated!;
  }

  async retryMigration(migrationId: string): Promise<MigrationDocument> {
    const migration = await this.migrationModel.findById(migrationId);
    if (!migration) {
      throw new NotFoundException('Migration not found');
    }
    if (!['failed', 'cancelled'].includes(migration.status)) {
      throw new BadRequestException(
        `Can only retry migrations in "failed" or "cancelled" state (current: ${migration.status})`,
      );
    }

    // Reset migration state
    const updated = await this.migrationModel.findByIdAndUpdate(
      migrationId,
      {
        status: 'pending',
        progress: 0,
        currentStep: 'Queued for retry',
        errorMessage: null,
        $push: {
          log: {
            timestamp: new Date(),
            level: 'info',
            message: 'Migration queued for retry',
          },
        },
      },
      { new: true },
    );

    // Create new job
    const job = await this.jobsService.createJob({
      type: 'MIGRATE_CLUSTER',
      targetClusterId: migration.targetClusterId.toString(),
      targetProjectId: migration.targetProjectId.toString(),
      targetOrgId: migration.targetOrgId.toString(),
      payload: {
        migrationId: migration.id,
        sourceUri: migration.sourceUri,
        databases: migration.databases,
        options: migration.options,
      },
    });

    await this.migrationModel.findByIdAndUpdate(migrationId, {
      jobId: (job as any)._id || job.id,
    });

    return updated!;
  }

  // ================================================================
  // Helper Methods
  // ================================================================

  private async updateMigrationStatus(
    migrationId: string,
    status: MigrationStatus,
    progress: number,
    currentStep: string,
  ): Promise<void> {
    const update: any = { status, progress, currentStep };
    if (status === 'validating' || status === 'dumping') {
      update['stats.startedAt'] = new Date();
    }
    await this.migrationModel.findByIdAndUpdate(migrationId, update);
  }

  private async updateDbProgress(
    migrationId: string,
    dbName: string,
    status: string,
    error?: string,
  ): Promise<void> {
    const update: any = {
      'databaseProgress.$.status': status,
    };
    if (status === 'dumping') {
      update['databaseProgress.$.startedAt'] = new Date();
    }
    if (status === 'completed') {
      update['databaseProgress.$.completedAt'] = new Date();
    }
    if (error) {
      update['databaseProgress.$.error'] = error;
    }

    await this.migrationModel.findOneAndUpdate(
      { _id: migrationId, 'databaseProgress.name': dbName },
      { $set: update },
    );
  }

  private async addLog(
    migrationId: string,
    level: 'info' | 'warn' | 'error',
    message: string,
  ): Promise<void> {
    await this.migrationModel.findByIdAndUpdate(migrationId, {
      $push: {
        log: {
          $each: [{ timestamp: new Date(), level, message }],
          $slice: -500, // Keep last 500 log entries
        },
      },
    });
    if (level === 'error') {
      this.logger.error(`[Migration ${migrationId}] ${message}`);
    } else {
      this.logger.log(`[Migration ${migrationId}] ${message}`);
    }
  }

  private async getDbProgressDocs(
    migrationId: string,
    dbName: string,
  ): Promise<number> {
    const migration = await this.migrationModel.findById(migrationId);
    const dbProgress = migration?.databaseProgress?.find(
      (d) => d.name === dbName,
    );
    return dbProgress?.documentsCompleted || 0;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
      return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }
}

function completionsLabel(completed: number, total: number): string {
  return `${completed}/${total} collections`;
}
