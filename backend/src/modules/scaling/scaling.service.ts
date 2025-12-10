import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScalingRecommendation, ScalingRecommendationDocument, RecommendationType, RecommendationPriority } from './schemas/scaling-recommendation.schema';
import { MetricsService } from '../metrics/metrics.service';
import { ClustersService } from '../clusters/clusters.service';

interface PlanSpec {
  name: string;
  cpu: number;
  memory: number;
  storage: number;
  connections: number;
  monthlyPrice: number;
}

const PLAN_SPECS: Record<string, PlanSpec> = {
  DEV: { name: 'DEV', cpu: 0.5, memory: 512, storage: 5, connections: 50, monthlyPrice: 9 },
  SMALL: { name: 'SMALL', cpu: 1, memory: 1024, storage: 20, connections: 100, monthlyPrice: 29 },
  MEDIUM: { name: 'MEDIUM', cpu: 2, memory: 2048, storage: 50, connections: 200, monthlyPrice: 59 },
  LARGE: { name: 'LARGE', cpu: 4, memory: 4096, storage: 100, connections: 500, monthlyPrice: 119 },
  XLARGE: { name: 'XLARGE', cpu: 8, memory: 8192, storage: 200, connections: 1000, monthlyPrice: 229 },
};

const PLAN_ORDER = ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

@Injectable()
export class ScalingService {
  private readonly logger = new Logger(ScalingService.name);

  constructor(
    @InjectModel(ScalingRecommendation.name) private recommendationModel: Model<ScalingRecommendationDocument>,
    private metricsService: MetricsService,
    private clustersService: ClustersService,
  ) {}

  async getRecommendations(clusterId: string): Promise<ScalingRecommendation[]> {
    return this.recommendationModel
      .find({
        clusterId: new Types.ObjectId(clusterId),
        status: 'active',
      })
      .sort({ priority: -1, createdAt: -1 })
      .exec();
  }

  async getRecommendationHistory(clusterId: string, limit = 20): Promise<ScalingRecommendation[]> {
    return this.recommendationModel
      .find({ clusterId: new Types.ObjectId(clusterId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async applyRecommendation(recommendationId: string, userId: string): Promise<ScalingRecommendation> {
    const recommendation = await this.recommendationModel.findById(recommendationId);
    if (!recommendation) {
      throw new NotFoundException('Recommendation not found');
    }

    if (recommendation.status !== 'active') {
      throw new Error('Recommendation is no longer active');
    }

    // Apply the scaling (trigger resize)
    if (recommendation.recommendedPlan) {
      await this.clustersService.resize(
        recommendation.clusterId.toString(),
        { plan: recommendation.recommendedPlan as 'DEV' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' },
      );
    }

    recommendation.status = 'applied';
    recommendation.appliedAt = new Date();
    await recommendation.save();

    this.logger.log(`Applied recommendation ${recommendationId} for cluster ${recommendation.clusterId}`);
    return recommendation;
  }

  async dismissRecommendation(
    recommendationId: string,
    userId: string,
    reason?: string,
  ): Promise<ScalingRecommendation> {
    const recommendation = await this.recommendationModel.findById(recommendationId);
    if (!recommendation) {
      throw new NotFoundException('Recommendation not found');
    }

    recommendation.status = 'dismissed';
    recommendation.dismissedAt = new Date();
    recommendation.dismissedBy = new Types.ObjectId(userId);
    recommendation.dismissReason = reason;
    await recommendation.save();

    return recommendation;
  }

  async analyzeCluster(clusterId: string): Promise<ScalingRecommendation | null> {
    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster || cluster.status !== 'ready') {
      return null;
    }

    // Get metrics from the last 7 days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const metrics = await this.metricsService.getMetrics(clusterId, '7d');
    if (!metrics || !metrics.cpu || metrics.cpu.length === 0) {
      return null;
    }

    // Calculate statistics
    const cpuValues = metrics.cpu.map((m: any) => m.value);
    const memValues = metrics.memory.map((m: any) => m.value);
    const connValues = metrics.connections?.current?.map((m: any) => m.value) || [];

    const avgCpu = cpuValues.reduce((a: number, b: number) => a + b, 0) / cpuValues.length;
    const maxCpu = Math.max(...cpuValues);
    const avgMem = memValues.reduce((a: number, b: number) => a + b, 0) / memValues.length;
    const maxMem = Math.max(...memValues);
    const avgConn = connValues.length > 0 
      ? connValues.reduce((a: number, b: number) => a + b, 0) / connValues.length 
      : 0;
    const maxConn = connValues.length > 0 ? Math.max(...connValues) : 0;

    const currentPlan = (cluster as any).plan;
    const currentPlanSpec = PLAN_SPECS[currentPlan];
    const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);

    // Analyze and generate recommendation
    let type: RecommendationType = 'no_change';
    let priority: RecommendationPriority = 'low';
    let recommendedPlan: string | undefined;
    let title = '';
    let description = '';
    let reason = '';
    const insights: string[] = [];

    // Check for scale up needs
    if (maxCpu > 90 || avgCpu > 80) {
      type = 'scale_up';
      priority = maxCpu > 95 ? 'critical' : 'high';
      title = 'CPU capacity exceeded';
      reason = `CPU usage averaged ${avgCpu.toFixed(1)}% with peaks at ${maxCpu.toFixed(1)}%`;
      insights.push(`Average CPU: ${avgCpu.toFixed(1)}%`);
      insights.push(`Peak CPU: ${maxCpu.toFixed(1)}%`);
    } else if (maxMem > 90 || avgMem > 85) {
      type = 'scale_up';
      priority = maxMem > 95 ? 'critical' : 'high';
      title = 'Memory capacity exceeded';
      reason = `Memory usage averaged ${avgMem.toFixed(1)}% with peaks at ${maxMem.toFixed(1)}%`;
      insights.push(`Average Memory: ${avgMem.toFixed(1)}%`);
      insights.push(`Peak Memory: ${maxMem.toFixed(1)}%`);
    }
    // Check for scale down opportunity
    else if (avgCpu < 20 && avgMem < 30 && currentPlanIndex > 0) {
      type = 'scale_down';
      priority = 'medium';
      title = 'Cluster is over-provisioned';
      reason = `Resources consistently underutilized (CPU: ${avgCpu.toFixed(1)}%, Memory: ${avgMem.toFixed(1)}%)`;
      insights.push(`Average CPU: ${avgCpu.toFixed(1)}%`);
      insights.push(`Average Memory: ${avgMem.toFixed(1)}%`);
      insights.push('Consider downsizing to reduce costs');
    }

    if (type === 'no_change') {
      return null; // No recommendation needed
    }

    // Determine recommended plan
    if (type === 'scale_up' && currentPlanIndex < PLAN_ORDER.length - 1) {
      recommendedPlan = PLAN_ORDER[currentPlanIndex + 1];
    } else if (type === 'scale_down' && currentPlanIndex > 0) {
      recommendedPlan = PLAN_ORDER[currentPlanIndex - 1];
    }

    if (!recommendedPlan) {
      return null; // Already at min/max plan
    }

    const recommendedSpec = PLAN_SPECS[recommendedPlan];
    
    if (type === 'scale_up') {
      description = `Upgrade from ${currentPlan} to ${recommendedPlan} for better performance. This will increase your monthly cost by €${(recommendedSpec.monthlyPrice - currentPlanSpec.monthlyPrice).toFixed(0)}.`;
    } else {
      description = `Downgrade from ${currentPlan} to ${recommendedPlan} to optimize costs. This will save you €${(currentPlanSpec.monthlyPrice - recommendedSpec.monthlyPrice).toFixed(0)}/month.`;
    }

    // Check if similar active recommendation exists
    const existing = await this.recommendationModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      status: 'active',
      type,
    });

    if (existing) {
      return existing;
    }

    // Create recommendation
    const recommendation = new this.recommendationModel({
      clusterId: new Types.ObjectId(clusterId),
      orgId: (cluster as any).orgId,
      projectId: (cluster as any).projectId,
      type,
      status: 'active',
      priority,
      title,
      description,
      currentPlan,
      recommendedPlan,
      metrics: {
        avgCpuPercent: avgCpu,
        maxCpuPercent: maxCpu,
        avgMemoryPercent: avgMem,
        maxMemoryPercent: maxMem,
        avgConnections: avgConn,
        maxConnections: maxConn,
      },
      thresholds: {
        cpuThreshold: 80,
        memoryThreshold: 85,
      },
      estimatedMonthlySavings: type === 'scale_down' 
        ? currentPlanSpec.monthlyPrice - recommendedSpec.monthlyPrice 
        : undefined,
      estimatedMonthlyCost: type === 'scale_up'
        ? recommendedSpec.monthlyPrice - currentPlanSpec.monthlyPrice
        : undefined,
      reason,
      insights,
      analysisWindowStart: startDate,
      analysisWindowEnd: endDate,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await recommendation.save();
    this.logger.log(`Created ${type} recommendation for cluster ${clusterId}`);
    return recommendation;
  }

  // Run analysis for all clusters periodically
  @Cron(CronExpression.EVERY_HOUR)
  async analyzeAllClusters(): Promise<void> {
    this.logger.log('Running cluster scaling analysis...');
    
    // Get all ready clusters - get recommendations grouped by cluster
    const activeRecommendations = await this.recommendationModel.find({ status: 'active' }).distinct('clusterId');
    
    for (const clusterId of activeRecommendations) {
      try {
        await this.analyzeCluster(clusterId.toString());
      } catch (error) {
        this.logger.error(`Failed to analyze cluster ${clusterId}: ${error.message}`);
      }
    }

    // Expire old recommendations
    await this.recommendationModel.updateMany(
      {
        status: 'active',
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: 'expired' } },
    );
  }

  async getStats(orgId: string): Promise<{
    totalRecommendations: number;
    activeRecommendations: number;
    potentialMonthlySavings: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    const recommendations = await this.recommendationModel.find({
      orgId: new Types.ObjectId(orgId),
    }).exec();

    const active = recommendations.filter(r => r.status === 'active');
    const savings = active
      .filter(r => r.type === 'scale_down' && r.estimatedMonthlySavings)
      .reduce((sum, r) => sum + (r.estimatedMonthlySavings || 0), 0);

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const r of active) {
      byType[r.type] = (byType[r.type] || 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
    }

    return {
      totalRecommendations: recommendations.length,
      activeRecommendations: active.length,
      potentialMonthlySavings: savings,
      byType,
      byPriority,
    };
  }
}

