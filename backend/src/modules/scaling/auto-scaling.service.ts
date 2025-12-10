import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScalingRecommendation, ScalingRecommendationDocument } from './schemas/scaling-recommendation.schema';
import { ScalingService } from './scaling.service';
import { ClustersService } from '../clusters/clusters.service';
import { JobsService } from '../jobs/jobs.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';

export interface AutoScalingConfig {
  enabled: boolean;
  minPlan: string;
  maxPlan: string;
  scaleUpThreshold: number;   // CPU/Memory % to trigger scale up
  scaleDownThreshold: number; // CPU/Memory % to trigger scale down
  cooldownMinutes: number;    // Minutes to wait between scaling actions
  scheduleEnabled: boolean;
}

@Injectable()
export class AutoScalingService {
  private readonly logger = new Logger(AutoScalingService.name);
  
  // Plan ordering for scaling decisions
  private readonly planOrder = ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

  constructor(
    @InjectModel(ScalingRecommendation.name) private recommendationModel: Model<ScalingRecommendationDocument>,
    private scalingService: ScalingService,
    private clustersService: ClustersService,
    private jobsService: JobsService,
    private eventsService: EventsService,
    private auditService: AuditService,
  ) {}

  /**
   * Check and execute auto-scaling every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAutoScaling(): Promise<void> {
    this.logger.debug('Running auto-scaling check...');

    try {
      // Get all clusters with auto-scaling enabled
      const clusters = await this.clustersService.findAll();
      
      for (const cluster of clusters) {
        // Skip clusters not in running state
        if ((cluster.status as string) !== 'running') continue;

        // Check if cluster has auto-scaling enabled (via cluster settings)
        const config = await this.getAutoScalingConfig(cluster.id);
        if (!config?.enabled) continue;

        await this.evaluateClusterScaling(cluster, config);
      }
    } catch (error) {
      this.logger.error(`Auto-scaling check failed: ${error.message}`);
    }
  }

  /**
   * Get auto-scaling configuration for a cluster
   */
  async getAutoScalingConfig(clusterId: string): Promise<AutoScalingConfig | null> {
    // In a real implementation, this would come from cluster settings
    // For now, return a default config that can be extended
    return {
      enabled: false, // Disabled by default, users must enable
      minPlan: 'DEV',
      maxPlan: 'XLARGE',
      scaleUpThreshold: 80,
      scaleDownThreshold: 30,
      cooldownMinutes: 30,
      scheduleEnabled: false,
    };
  }

  /**
   * Enable auto-scaling for a cluster
   */
  async enableAutoScaling(
    clusterId: string,
    config: Partial<AutoScalingConfig>,
    userId: string,
    orgId?: string,
  ): Promise<void> {
    this.logger.log(`Enabling auto-scaling for cluster ${clusterId}`);

    // Store config (would typically go to cluster settings)
    // For now, we'll trigger an immediate evaluation

    if (orgId) {
      await this.auditService.log({
        orgId,
        action: 'UPDATE',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        description: `Enabled auto-scaling with config: ${JSON.stringify(config)}`,
      });
    }

    await this.eventsService.createEvent({
      orgId: orgId || 'system',
      clusterId,
      type: 'CLUSTER_MODIFIED',
      severity: 'info',
      message: 'Auto-scaling enabled',
      metadata: { config },
    });
  }

  /**
   * Disable auto-scaling for a cluster
   */
  async disableAutoScaling(
    clusterId: string,
    userId: string,
    orgId?: string,
  ): Promise<void> {
    this.logger.log(`Disabling auto-scaling for cluster ${clusterId}`);

    if (orgId) {
      await this.auditService.log({
        orgId,
        action: 'UPDATE',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        description: 'Disabled auto-scaling',
      });
    }
  }

  /**
   * Evaluate if a cluster needs scaling
   */
  private async evaluateClusterScaling(cluster: any, config: AutoScalingConfig): Promise<void> {
    // Get pending recommendations
    const recommendations = await this.recommendationModel.find({
      clusterId: new Types.ObjectId(cluster.id),
      status: 'pending',
      confidence: { $gte: 0.7 }, // Only high-confidence recommendations
    }).sort({ createdAt: -1 }).limit(1);

    if (recommendations.length === 0) return;

    const recommendation = recommendations[0];
    
    // Check cooldown period
    const lastScaling = await this.getLastScalingTime(cluster.id);
    if (lastScaling) {
      const cooldownEnd = new Date(lastScaling.getTime() + config.cooldownMinutes * 60 * 1000);
      if (new Date() < cooldownEnd) {
        this.logger.debug(`Cluster ${cluster.id} is in cooldown period`);
        return;
      }
    }

    // Validate scaling within bounds
    const currentPlanIndex = this.planOrder.indexOf(cluster.plan);
    const recommendedPlanIndex = this.planOrder.indexOf(recommendation.recommendedPlan || '');
    const minPlanIndex = this.planOrder.indexOf(config.minPlan);
    const maxPlanIndex = this.planOrder.indexOf(config.maxPlan);

    if (recommendedPlanIndex < minPlanIndex || recommendedPlanIndex > maxPlanIndex) {
      this.logger.debug(`Recommended plan ${recommendation.recommendedPlan} is outside bounds for cluster ${cluster.id}`);
      return;
    }

    // Execute the scaling
    await this.executeAutoScale(cluster, recommendation);
  }

  /**
   * Execute auto-scaling action
   */
  async executeAutoScale(cluster: any, recommendation: ScalingRecommendationDocument): Promise<void> {
    this.logger.log(`Auto-scaling cluster ${cluster.id} from ${cluster.plan} to ${recommendation.recommendedPlan}`);

    try {
      // Create resize job
      const job = await this.jobsService.createJob({
        type: 'RESIZE_CLUSTER',
        targetOrgId: cluster.orgId?.toString() || 'system',
        targetClusterId: cluster.id,
        payload: {
          newPlan: recommendation.recommendedPlan,
          reason: `Auto-scaling: ${recommendation.reason}`,
        },
      });

      // Update recommendation status
      recommendation.status = 'applied';
      recommendation.appliedAt = new Date();
      await recommendation.save();

      // Create event
      await this.eventsService.createEvent({
        orgId: cluster.orgId?.toString() || 'system',
        clusterId: cluster.id,
        type: 'CLUSTER_SCALING_STARTED',
        severity: 'info',
        message: `Auto-scaling from ${cluster.plan} to ${recommendation.recommendedPlan}`,
        metadata: {
          fromPlan: cluster.plan,
          toPlan: recommendation.recommendedPlan,
          reason: recommendation.reason,
          jobId: job.id,
          automatic: true,
        },
      });

      this.logger.log(`Created auto-scaling job ${job.id} for cluster ${cluster.id}`);
    } catch (error) {
      this.logger.error(`Failed to execute auto-scaling for cluster ${cluster.id}: ${error.message}`);
      
      recommendation.status = 'failed';
      await recommendation.save();
    }
  }

  /**
   * Apply a specific recommendation manually
   */
  async applyRecommendation(
    recommendationId: string,
    userId: string,
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    const recommendation = await this.recommendationModel.findById(recommendationId);
    if (!recommendation) {
      return { success: false, error: 'Recommendation not found' };
    }

    if (recommendation.status !== 'pending') {
      return { success: false, error: `Recommendation is already ${recommendation.status}` };
    }

    const cluster = await this.clustersService.findById(recommendation.clusterId.toString());
    if (!cluster) {
      return { success: false, error: 'Cluster not found' };
    }

    if (cluster.status !== 'running' as any) {
      return { success: false, error: 'Cluster must be running to apply scaling' };
    }

    try {
      const job = await this.jobsService.createJob({
        type: 'RESIZE_CLUSTER',
        targetOrgId: cluster.orgId?.toString() || 'system',
        targetClusterId: cluster.id,
        payload: {
          newPlan: recommendation.recommendedPlan,
          reason: `Manual scaling from recommendation: ${recommendation.reason}`,
        },
      });

      recommendation.status = 'applied';
      recommendation.appliedAt = new Date();
      recommendation.appliedBy = new Types.ObjectId(userId);
      await recommendation.save();

      await this.eventsService.createEvent({
        orgId: cluster.orgId?.toString() || 'system',
        clusterId: cluster.id,
        type: 'CLUSTER_SCALING_STARTED',
        severity: 'info',
        message: `Scaling from ${cluster.plan} to ${recommendation.recommendedPlan}`,
        metadata: {
          fromPlan: cluster.plan,
          toPlan: recommendation.recommendedPlan,
          reason: recommendation.reason,
          jobId: job.id,
          automatic: false,
          appliedBy: userId,
        },
      });

      return { success: true, jobId: job.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Dismiss a recommendation
   */
  async dismissRecommendation(
    recommendationId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const recommendation = await this.recommendationModel.findById(recommendationId);
    if (!recommendation) {
      throw new Error('Recommendation not found');
    }

    recommendation.status = 'dismissed';
    recommendation.dismissedAt = new Date();
    recommendation.dismissedBy = new Types.ObjectId(userId);
    recommendation.dismissReason = reason;
    await recommendation.save();
  }

  /**
   * Get last scaling time for cooldown calculation
   */
  private async getLastScalingTime(clusterId: string): Promise<Date | null> {
    const lastApplied = await this.recommendationModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      status: 'applied',
    }).sort({ appliedAt: -1 });

    return lastApplied?.appliedAt || null;
  }

  /**
   * Get scaling history for a cluster
   */
  async getScalingHistory(clusterId: string): Promise<any[]> {
    return this.recommendationModel.find({
      clusterId: new Types.ObjectId(clusterId),
      status: { $in: ['applied', 'dismissed'] },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }
}

