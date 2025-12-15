import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { ClustersService } from '../clusters/clusters.service';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { EventsService } from '../events/events.service';
import { BackupsService } from '../backups/backups.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { ProjectsService } from '../projects/projects.service';
import { JobDocument } from './schemas/job.schema';

@Injectable()
export class JobProcessorService implements OnModuleInit {
  private readonly logger = new Logger(JobProcessorService.name);
  private isProcessing = false;

  constructor(
    private readonly jobsService: JobsService,
    @Inject(forwardRef(() => ClustersService))
    private readonly clustersService: ClustersService,
    private readonly kubernetesService: KubernetesService,
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => BackupsService))
    private readonly backupsService: BackupsService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  onModuleInit() {
    this.logger.log('Job Processor initialized');
  }

  @Interval(5000) // Process jobs every 5 seconds
  async processJobs() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const jobs = await this.jobsService.findPendingJobs(5);
      
      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch (error) {
      this.logger.error('Error processing jobs', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: JobDocument) {
    this.logger.log(`Processing job ${job.id} of type ${job.type}`);
    
    // Mark job as in progress
    await this.jobsService.startJob(job.id);

    try {
      switch (job.type) {
        case 'CREATE_CLUSTER':
          await this.processCreateCluster(job);
          break;
        case 'RESIZE_CLUSTER':
          await this.processResizeCluster(job);
          break;
        case 'DELETE_CLUSTER':
          await this.processDeleteCluster(job);
          break;
        case 'PAUSE_CLUSTER':
          await this.processPauseCluster(job);
          break;
        case 'RESUME_CLUSTER':
          await this.processResumeCluster(job);
          break;
        case 'BACKUP_CLUSTER':
          await this.processBackupCluster(job);
          break;
        case 'RESTORE_CLUSTER':
          await this.processRestoreCluster(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await this.jobsService.completeJob(job.id);
      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      await this.jobsService.failJob(job.id, error.message);
      
      // Update cluster status if this was the last retry
      if (job.targetClusterId && job.attempts >= job.maxAttempts) {
        await this.clustersService.updateStatus(job.targetClusterId.toString(), 'failed');
        await this.eventsService.createEvent({
          orgId: job.targetOrgId?.toString() || '',
          projectId: job.targetProjectId?.toString(),
          clusterId: job.targetClusterId?.toString(),
          type: 'CLUSTER_FAILED',
          severity: 'error',
          message: `Cluster operation failed: ${error.message}`,
        });
      }
    }
  }

  private async processCreateCluster(job: JobDocument) {
    const { plan, mongoVersion, credentials, clusterName, createdBy } = job.payload as any;
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();
    const orgId = job.targetOrgId!.toString();
    
    // Create K8s resources
    const result = await this.kubernetesService.createMongoCluster({
      clusterId,
      projectId,
      orgId,
      clusterName: clusterName || `cluster-${clusterId}`,
      plan,
      mongoVersion,
      credentials,
    });

    // Update cluster with connection info
    await this.clustersService.updateStatus(clusterId, 'ready', {
      host: result.host,
      port: result.port,
    });

    // Create event
    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_READY',
      severity: 'info',
      message: 'Cluster is ready for connections',
    });

    // Send cluster ready email to creator
    try {
      if (createdBy) {
        const user = await this.usersService.findById(createdBy);
        const project = await this.projectsService.findById(projectId);
        if (user?.email) {
          const connectionString = `mongodb://${credentials?.username || 'admin'}:****@${result.host}:${result.port}`;
          await this.emailService.sendClusterReady(
            user.email,
            clusterName || clusterId,
            connectionString,
            project?.name || projectId,
          );
          this.logger.log(`Sent cluster ready email to ${user.email}`);
        }
      }
    } catch (emailError) {
      this.logger.warn(`Failed to send cluster ready email: ${emailError}`);
    }
  }

  private async processResizeCluster(job: JobDocument) {
    const { oldPlan, newPlan } = job.payload as any;
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();

    // Update K8s resources
    await this.kubernetesService.resizeMongoCluster({
      clusterId,
      projectId,
      newPlan,
    });

    // Update cluster status and plan
    await this.clustersService.updatePlan(clusterId, newPlan);
    await this.clustersService.updateStatus(clusterId, 'ready');

    // Create event
    await this.eventsService.createEvent({
      orgId: job.targetOrgId!.toString(),
      projectId,
      clusterId,
      type: 'CLUSTER_RESIZED',
      severity: 'info',
      message: `Cluster resized from ${oldPlan} to ${newPlan}`,
    });
  }

  private async processDeleteCluster(job: JobDocument) {
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();

    // Delete K8s resources
    await this.kubernetesService.deleteMongoCluster({ clusterId, projectId });

    // Hard delete cluster from database
    await this.clustersService.hardDelete(clusterId);

    // Create event
    await this.eventsService.createEvent({
      orgId: job.targetOrgId!.toString(),
      projectId,
      type: 'CLUSTER_DELETED',
      severity: 'info',
      message: 'Cluster has been deleted',
    });
  }

  private async processPauseCluster(job: JobDocument) {
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();
    const reason = (job.payload as any)?.reason;

    // Scale down K8s resources
    await this.kubernetesService.pauseMongoCluster({ clusterId, projectId });

    // Update cluster status
    await this.clustersService.markAsPaused(clusterId);

    // Create event
    await this.eventsService.createEvent({
      orgId: job.targetOrgId!.toString(),
      projectId,
      clusterId,
      type: 'CLUSTER_UPDATED',
      severity: 'info',
      message: `Cluster paused${reason ? `: ${reason}` : ''}`,
      metadata: { action: 'pause', reason },
    });
  }

  private async processResumeCluster(job: JobDocument) {
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();
    const reason = (job.payload as any)?.reason;
    const plan = (job.payload as any)?.plan || 'DEV';

    // Scale up K8s resources
    await this.kubernetesService.resumeMongoCluster({ clusterId, projectId, plan });

    // Update cluster status
    await this.clustersService.markAsResumed(clusterId);

    // Create event
    await this.eventsService.createEvent({
      orgId: job.targetOrgId!.toString(),
      projectId,
      clusterId,
      type: 'CLUSTER_READY',
      severity: 'info',
      message: `Cluster resumed${reason ? `: ${reason}` : ''}`,
      metadata: { action: 'resume', reason },
    });
  }

  private async processBackupCluster(job: JobDocument) {
    const { backupId } = job.payload as any;
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();

    // Start backup
    await this.backupsService.startBackup(backupId);

    // Create backup via K8s job
    await this.kubernetesService.createBackup({ clusterId, projectId, backupId });

    // Complete backup with simulated results
    const sizeBytes = Math.floor(Math.random() * 100 * 1024 * 1024) + 10 * 1024 * 1024; // 10-110MB
    await this.backupsService.completeBackup(backupId, {
      sizeBytes,
      compressedSizeBytes: Math.floor(sizeBytes * 0.6),
      storagePath: `/backups/${clusterId}/${backupId}.archive`,
      metadata: {
        databases: ['admin', 'local', 'test'],
        collections: Math.floor(Math.random() * 20) + 5,
        documents: Math.floor(Math.random() * 10000) + 1000,
        indexes: Math.floor(Math.random() * 30) + 10,
      },
    });
  }

  private async processRestoreCluster(job: JobDocument) {
    const { backupId } = job.payload as any;
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();

    // Restore via K8s job
    await this.kubernetesService.restoreBackup({ clusterId, projectId, backupId });

    // Complete restore
    await this.backupsService.completeRestore(backupId);

    // Create event
    await this.eventsService.createEvent({
      orgId: job.targetOrgId!.toString(),
      projectId,
      clusterId,
      type: 'BACKUP_RESTORE_COMPLETED',
      severity: 'info',
      message: `Restore completed from backup`,
      metadata: { backupId },
    });
  }
}
