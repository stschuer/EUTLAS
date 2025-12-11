import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Interval } from '@nestjs/schedule';
import { SlowQuery, SlowQueryDocument } from './schemas/slow-query.schema';
import { IndexSuggestion, IndexSuggestionDocument, ImpactLevel } from './schemas/index-suggestion.schema';
import { DataExplorerService } from '../data-explorer/data-explorer.service';
import { ClustersService } from '../clusters/clusters.service';
import { QuerySlowQueriesDto, ExplainQueryDto, AnalyzeQueryDto } from './dto/performance-advisor.dto';

export interface QueryExplainResult {
  queryPlanner: {
    plannerVersion: number;
    namespace: string;
    indexFilterSet: boolean;
    parsedQuery: any;
    winningPlan: {
      stage: string;
      inputStage?: any;
      indexName?: string;
      keyPattern?: any;
      direction?: string;
    };
    rejectedPlans: any[];
  };
  executionStats?: {
    executionSuccess: boolean;
    nReturned: number;
    executionTimeMillis: number;
    totalKeysExamined: number;
    totalDocsExamined: number;
    executionStages: any;
  };
  serverInfo?: any;
}

export interface PerformanceStats {
  totalSlowQueries: number;
  avgExecutionTime: number;
  topCollections: { collection: string; count: number; avgTime: number }[];
  collectionScans: number;
  pendingSuggestions: number;
}

export interface QueryAnalysis {
  isOptimal: boolean;
  usesIndex: boolean;
  indexUsed?: string;
  collectionScan: boolean;
  docsExamined: number;
  docsReturned: number;
  efficiency: number; // docsReturned / docsExamined
  suggestions: string[];
  suggestedIndex?: Record<string, 1 | -1>;
  estimatedImprovement?: number;
}

@Injectable()
export class PerformanceAdvisorService {
  private readonly logger = new Logger(PerformanceAdvisorService.name);

  constructor(
    @InjectModel(SlowQuery.name) private slowQueryModel: Model<SlowQueryDocument>,
    @InjectModel(IndexSuggestion.name) private indexSuggestionModel: Model<IndexSuggestionDocument>,
    private readonly dataExplorerService: DataExplorerService,
    private readonly clustersService: ClustersService,
  ) {}

  // ==================== Slow Queries ====================

  async getSlowQueries(
    clusterId: string,
    queryDto: QuerySlowQueriesDto,
  ): Promise<SlowQuery[]> {
    const query: any = { clusterId };

    if (queryDto.database) {
      query.database = queryDto.database;
    }
    if (queryDto.collection) {
      query.collection = queryDto.collection;
    }
    if (queryDto.minExecutionTimeMs) {
      query.executionTimeMs = { $gte: queryDto.minExecutionTimeMs };
    }
    if (queryDto.startDate || queryDto.endDate) {
      query.timestamp = {};
      if (queryDto.startDate) {
        query.timestamp.$gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        query.timestamp.$lte = new Date(queryDto.endDate);
      }
    }

    return this.slowQueryModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(queryDto.limit || 50)
      .exec();
  }

  async getSlowQueryById(queryId: string): Promise<SlowQuery | null> {
    return this.slowQueryModel.findById(queryId).exec();
  }

  async recordSlowQuery(data: Partial<SlowQuery>): Promise<SlowQuery> {
    const slowQuery = new this.slowQueryModel(data);
    await slowQuery.save();
    
    // Trigger index suggestion analysis
    this.analyzeForIndexSuggestion(slowQuery).catch(err => 
      this.logger.error(`Failed to analyze slow query: ${err.message}`)
    );
    
    return slowQuery;
  }

  async getSlowQueryStats(clusterId: string, days: number = 7): Promise<PerformanceStats> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [stats, collectionStats, collectionScans, suggestions] = await Promise.all([
      this.slowQueryModel.aggregate([
        { $match: { clusterId: new Types.ObjectId(clusterId), timestamp: { $gte: startDate } } },
        { $group: { _id: null, count: { $sum: 1 }, avgTime: { $avg: '$executionTimeMs' } } },
      ]).exec(),
      
      this.slowQueryModel.aggregate([
        { $match: { clusterId: new Types.ObjectId(clusterId), timestamp: { $gte: startDate } } },
        { $group: { 
          _id: { db: '$database', coll: '$collection' }, 
          count: { $sum: 1 }, 
          avgTime: { $avg: '$executionTimeMs' } 
        }},
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec(),
      
      this.slowQueryModel.countDocuments({
        clusterId,
        timestamp: { $gte: startDate },
        collectionScan: true,
      }).exec(),
      
      this.indexSuggestionModel.countDocuments({
        clusterId,
        status: 'pending',
      }).exec(),
    ]);

    return {
      totalSlowQueries: stats[0]?.count || 0,
      avgExecutionTime: Math.round(stats[0]?.avgTime || 0),
      topCollections: collectionStats.map((s: any) => ({
        collection: `${s._id.db}.${s._id.coll}`,
        count: s.count,
        avgTime: Math.round(s.avgTime),
      })),
      collectionScans,
      pendingSuggestions: suggestions,
    };
  }

  // ==================== Query Explain ====================

  async explainQuery(
    clusterId: string,
    explainDto: ExplainQueryDto,
  ): Promise<QueryExplainResult> {
    const client = await this.dataExplorerService.getConnection(clusterId);
    const db = client.db(explainDto.database);
    const collection = db.collection(explainDto.collection);

    const cursor = collection.find(explainDto.query);
    if (explainDto.sort) {
      cursor.sort(explainDto.sort);
    }

    const explanation = await cursor.explain(explainDto.verbosity || 'executionStats');
    return explanation as QueryExplainResult;
  }

  async analyzeQuery(
    clusterId: string,
    analyzeDto: AnalyzeQueryDto,
  ): Promise<QueryAnalysis> {
    const explanation = await this.explainQuery(clusterId, {
      ...analyzeDto,
      verbosity: 'executionStats',
    });

    const winningPlan = explanation.queryPlanner.winningPlan;
    const execStats = explanation.executionStats;

    const isCollectionScan = this.isCollectionScan(winningPlan);
    const usesIndex = !isCollectionScan && !!winningPlan.indexName;
    
    const docsExamined = execStats?.totalDocsExamined || 0;
    const docsReturned = execStats?.nReturned || 0;
    const efficiency = docsExamined > 0 ? docsReturned / docsExamined : 1;

    const suggestions: string[] = [];
    let suggestedIndex: Record<string, 1 | -1> | undefined;

    if (isCollectionScan) {
      suggestions.push('Query performs a full collection scan (COLLSCAN). Consider adding an index.');
      suggestedIndex = this.suggestIndexForQuery(analyzeDto.query, analyzeDto.sort);
    } else if (efficiency < 0.5) {
      suggestions.push(`Query efficiency is low (${(efficiency * 100).toFixed(1)}%). The index may not be optimal.`);
      suggestedIndex = this.suggestIndexForQuery(analyzeDto.query, analyzeDto.sort);
    }

    if (docsExamined > 10000 && docsReturned < 100) {
      suggestions.push('Query examines many documents but returns few. Consider adding a more selective index.');
    }

    return {
      isOptimal: !isCollectionScan && efficiency >= 0.8,
      usesIndex,
      indexUsed: winningPlan.indexName,
      collectionScan: isCollectionScan,
      docsExamined,
      docsReturned,
      efficiency: Math.round(efficiency * 100) / 100,
      suggestions,
      suggestedIndex,
      estimatedImprovement: isCollectionScan ? 80 : efficiency < 0.5 ? 50 : undefined,
    };
  }

  // ==================== Index Suggestions ====================

  async getIndexSuggestions(
    clusterId: string,
    status?: string,
  ): Promise<IndexSuggestion[]> {
    const query: any = { clusterId };
    if (status) {
      query.status = status;
    }

    return this.indexSuggestionModel
      .find(query)
      .sort({ impact: 1, queryCount: -1 })
      .exec();
  }

  async getSuggestionById(suggestionId: string): Promise<IndexSuggestion | null> {
    return this.indexSuggestionModel.findById(suggestionId).exec();
  }

  async applySuggestion(
    suggestionId: string,
    userId: string,
    options?: { indexName?: string; background?: boolean },
  ): Promise<void> {
    const suggestion = await this.indexSuggestionModel.findById(suggestionId).exec();
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    if (suggestion.status !== 'pending') {
      throw new BadRequestException(`Suggestion is already ${suggestion.status}`);
    }

    // Create the index via Data Explorer
    await this.dataExplorerService.createIndex(
      suggestion.clusterId.toString(),
      suggestion.database,
      suggestion.collection,
      suggestion.suggestedIndex,
      {
        name: options?.indexName || suggestion.suggestedIndexName,
        background: options?.background ?? true,
      },
    );

    // Update suggestion status
    suggestion.status = 'applied';
    suggestion.appliedAt = new Date();
    suggestion.appliedBy = new Types.ObjectId(userId);
    await suggestion.save();

    this.logger.log(`Index suggestion ${suggestionId} applied by ${userId}`);
  }

  async dismissSuggestion(
    suggestionId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const suggestion = await this.indexSuggestionModel.findById(suggestionId).exec();
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    suggestion.status = 'dismissed';
    suggestion.dismissedAt = new Date();
    suggestion.dismissedBy = new Types.ObjectId(userId);
    suggestion.dismissReason = reason;
    await suggestion.save();

    this.logger.log(`Index suggestion ${suggestionId} dismissed by ${userId}`);
  }

  // ==================== Profiler Settings ====================

  async getProfilerStatus(clusterId: string, database: string): Promise<{
    was: number;
    slowms: number;
    sampleRate: number;
  }> {
    const client = await this.dataExplorerService.getConnection(clusterId);
    const db = client.db(database);
    
    const result = await db.command({ profile: -1 });
    return {
      was: result.was,
      slowms: result.slowms,
      sampleRate: result.sampleRate || 1.0,
    };
  }

  async setProfilerLevel(
    clusterId: string,
    database: string,
    level: 'off' | 'slow' | 'all',
    slowMs?: number,
    sampleRate?: number,
  ): Promise<void> {
    const client = await this.dataExplorerService.getConnection(clusterId);
    const db = client.db(database);

    const profileLevel = level === 'off' ? 0 : level === 'slow' ? 1 : 2;
    
    const command: any = { profile: profileLevel };
    if (slowMs !== undefined) command.slowms = slowMs;
    if (sampleRate !== undefined) command.sampleRate = sampleRate;

    await db.command(command);
    this.logger.log(`Profiler set to ${level} for ${database} on cluster ${clusterId}`);
  }

  // ==================== Background Analysis ====================

  @Interval(300000) // Every 5 minutes
  async collectSlowQueries(): Promise<void> {
    // In production, this would poll the MongoDB profiler
    // For now, we'll simulate or integrate with actual profiler data
    this.logger.debug('Collecting slow queries from profiler...');
  }

  private async analyzeForIndexSuggestion(slowQuery: SlowQueryDocument): Promise<void> {
    if (!slowQuery.collectionScan && slowQuery.executionTimeMs < 500) {
      return; // Not worth suggesting
    }

    const suggestedIndex = this.suggestIndexForQuery(slowQuery.query, slowQuery.sort);
    if (!suggestedIndex) {
      return;
    }

    // Check if suggestion already exists
    const existing = await this.indexSuggestionModel.findOne({
      clusterId: slowQuery.clusterId,
      database: slowQuery.database,
      collection: slowQuery.collection,
      suggestedIndex,
      status: 'pending',
    }).exec();

    if (existing) {
      // Update existing suggestion
      existing.queryCount += 1;
      existing.avgExecutionTimeMs = Math.round(
        (existing.avgExecutionTimeMs * (existing.queryCount - 1) + slowQuery.executionTimeMs) / existing.queryCount
      );
      if (existing.sampleQueries.length < 5) {
        existing.sampleQueries.push(JSON.stringify(slowQuery.query).slice(0, 500));
      }
      await existing.save();
    } else {
      // Create new suggestion
      const impact = this.calculateImpact(slowQuery);
      const suggestion = new this.indexSuggestionModel({
        clusterId: slowQuery.clusterId,
        orgId: slowQuery.orgId,
        database: slowQuery.database,
        collection: slowQuery.collection,
        suggestedIndex,
        suggestedIndexName: this.generateIndexName(suggestedIndex),
        impact,
        reason: slowQuery.collectionScan 
          ? 'Collection scan detected - adding an index would significantly improve performance'
          : 'Query performance could be improved with a better index',
        avgExecutionTimeMs: slowQuery.executionTimeMs,
        queryCount: 1,
        sampleQueries: [JSON.stringify(slowQuery.query).slice(0, 500)],
        estimatedImprovementPercent: slowQuery.collectionScan ? 80 : 50,
      });
      await suggestion.save();
      this.logger.log(`Created index suggestion for ${slowQuery.database}.${slowQuery.collection}`);
    }
  }

  // ==================== Helpers ====================

  private isCollectionScan(plan: any): boolean {
    if (plan.stage === 'COLLSCAN') return true;
    if (plan.inputStage) return this.isCollectionScan(plan.inputStage);
    return false;
  }

  private suggestIndexForQuery(
    query: Record<string, any>,
    sort?: Record<string, any>,
  ): Record<string, 1 | -1> | undefined {
    if (!query || Object.keys(query).length === 0) {
      return sort ? sort as Record<string, 1 | -1> : undefined;
    }

    const index: Record<string, 1 | -1> = {};

    // Add equality fields first
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('$')) continue; // Skip operators at root level
      if (typeof value !== 'object' || value === null) {
        index[key] = 1;
      } else if (!Object.keys(value).some(k => k.startsWith('$'))) {
        index[key] = 1;
      }
    }

    // Add range fields
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('$')) continue;
      if (typeof value === 'object' && value !== null) {
        const ops = Object.keys(value);
        if (ops.some(op => ['$gt', '$gte', '$lt', '$lte', '$ne', '$in'].includes(op))) {
          if (!index[key]) {
            index[key] = 1;
          }
        }
      }
    }

    // Add sort fields
    if (sort) {
      for (const [key, direction] of Object.entries(sort)) {
        if (!index[key]) {
          index[key] = direction as 1 | -1;
        }
      }
    }

    return Object.keys(index).length > 0 ? index : undefined;
  }

  private calculateImpact(slowQuery: SlowQueryDocument): ImpactLevel {
    if (slowQuery.collectionScan && slowQuery.executionTimeMs > 1000) {
      return 'high';
    }
    if (slowQuery.collectionScan || slowQuery.executionTimeMs > 500) {
      return 'medium';
    }
    return 'low';
  }

  private generateIndexName(keys: Record<string, number>): string {
    return Object.entries(keys)
      .map(([k, v]) => `${k}_${v}`)
      .join('_');
  }
}



