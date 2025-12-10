import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cluster, ClusterDocument, ClusterStatus, ClusterPlan } from './schemas/cluster.schema';
import { CreateClusterDto } from './dto/create-cluster.dto';
import { ResizeClusterDto } from './dto/resize-cluster.dto';
import { JobsService } from '../jobs/jobs.service';
import { CredentialsService } from '../credentials/credentials.service';

@Injectable()
export class ClustersService {
  constructor(
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    @Inject(forwardRef(() => JobsService)) private jobsService: JobsService,
    private credentialsService: CredentialsService,
  ) {}

  async create(
    projectId: string,
    orgId: string,
    createClusterDto: CreateClusterDto,
  ): Promise<Cluster> {
    // Check if name exists in project
    const existing = await this.clusterModel.findOne({
      projectId,
      name: createClusterDto.name,
    }).exec();
    
    if (existing) {
      throw new ConflictException({
        code: 'CLUSTER_EXISTS',
        message: 'A cluster with this name already exists in this project',
      });
    }

    // Generate credentials
    const credentials = await this.credentialsService.generateCredentials();

    // Create cluster in pending state
    const cluster = new this.clusterModel({
      projectId,
      orgId,
      name: createClusterDto.name,
      plan: createClusterDto.plan,
      mongoVersion: createClusterDto.mongoVersion || '7.0',
      status: 'creating' as ClusterStatus,
      credentialsEncrypted: credentials.encrypted,
    });

    await cluster.save();

    // Create provisioning job
    await this.jobsService.createJob({
      type: 'CREATE_CLUSTER',
      targetClusterId: cluster.id,
      targetProjectId: projectId,
      targetOrgId: orgId,
      payload: {
        plan: createClusterDto.plan,
        mongoVersion: cluster.mongoVersion,
        credentials: credentials.raw,
      },
    });

    return cluster;
  }

  async findAllByProject(projectId: string): Promise<Cluster[]> {
    return this.clusterModel.find({ projectId }).sort({ createdAt: -1 }).exec();
  }

  async findById(clusterId: string): Promise<ClusterDocument | null> {
    return this.clusterModel.findById(clusterId).exec();
  }

  async findAll(): Promise<ClusterDocument[]> {
    return this.clusterModel.find().exec();
  }

  async findByIdWithCredentials(clusterId: string) {
    const cluster = await this.findById(clusterId);
    if (!cluster) return null;

    const credentials = await this.credentialsService.decryptCredentials(
      cluster.credentialsEncrypted,
    );

    return {
      cluster,
      credentials: {
        connectionString: this.buildConnectionString(cluster, credentials),
        host: cluster.connectionHost || 'pending',
        port: cluster.connectionPort || 27017,
        username: credentials.username,
        password: credentials.password,
      },
    };
  }

  async resize(clusterId: string, resizeClusterDto: ResizeClusterDto): Promise<Cluster> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (!this.canModifyCluster(cluster.status)) {
      throw new BadRequestException({
        code: 'CLUSTER_NOT_READY',
        message: `Cannot resize cluster in ${cluster.status} state`,
      });
    }

    if (cluster.plan === resizeClusterDto.plan) {
      throw new BadRequestException({
        code: 'SAME_PLAN',
        message: 'Cluster is already on this plan',
      });
    }

    // Update status
    cluster.status = 'updating' as ClusterStatus;
    cluster.previousPlan = cluster.plan;
    await cluster.save();

    // Create resize job
    await this.jobsService.createJob({
      type: 'RESIZE_CLUSTER',
      targetClusterId: clusterId,
      targetProjectId: cluster.projectId.toString(),
      targetOrgId: cluster.orgId.toString(),
      payload: {
        oldPlan: cluster.previousPlan,
        newPlan: resizeClusterDto.plan,
      },
    });

    return cluster;
  }

  async delete(clusterId: string): Promise<void> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (cluster.status === 'deleting') {
      throw new BadRequestException({
        code: 'ALREADY_DELETING',
        message: 'Cluster is already being deleted',
      });
    }

    // Update status
    cluster.status = 'deleting' as ClusterStatus;
    await cluster.save();

    // Create deletion job
    await this.jobsService.createJob({
      type: 'DELETE_CLUSTER',
      targetClusterId: clusterId,
      targetProjectId: cluster.projectId.toString(),
      targetOrgId: cluster.orgId.toString(),
    });
  }

  async updateStatus(
    clusterId: string,
    status: ClusterStatus,
    connectionInfo?: { host: string; port: number },
  ): Promise<ClusterDocument> {
    const updateData: any = { status };
    
    if (connectionInfo) {
      updateData.connectionHost = connectionInfo.host;
      updateData.connectionPort = connectionInfo.port;
    }

    const cluster = await this.clusterModel.findByIdAndUpdate(
      clusterId,
      { $set: updateData },
      { new: true },
    ).exec();

    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    return cluster;
  }

  async updatePlan(clusterId: string, plan: ClusterPlan): Promise<ClusterDocument> {
    const cluster = await this.clusterModel.findByIdAndUpdate(
      clusterId,
      { 
        $set: { plan, previousPlan: undefined },
      },
      { new: true },
    ).exec();

    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    return cluster;
  }

  async hardDelete(clusterId: string): Promise<void> {
    await this.clusterModel.findByIdAndDelete(clusterId).exec();
  }

  async pause(clusterId: string, reason?: string): Promise<Cluster> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (cluster.status !== 'ready') {
      throw new BadRequestException({
        code: 'CANNOT_PAUSE',
        message: `Cannot pause cluster in ${cluster.status} state. Cluster must be ready.`,
      });
    }

    // Update status to pausing
    cluster.status = 'pausing' as ClusterStatus;
    cluster.pauseReason = reason;
    await cluster.save();

    // Create pause job
    await this.jobsService.createJob({
      type: 'PAUSE_CLUSTER' as any,
      targetClusterId: clusterId,
      targetProjectId: cluster.projectId.toString(),
      targetOrgId: cluster.orgId.toString(),
      payload: { reason },
    });

    return cluster;
  }

  async resume(clusterId: string, reason?: string): Promise<Cluster> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (cluster.status !== 'paused') {
      throw new BadRequestException({
        code: 'CANNOT_RESUME',
        message: `Cannot resume cluster in ${cluster.status} state. Cluster must be paused.`,
      });
    }

    // Update status to resuming
    cluster.status = 'resuming' as ClusterStatus;
    await cluster.save();

    // Create resume job
    await this.jobsService.createJob({
      type: 'RESUME_CLUSTER' as any,
      targetClusterId: clusterId,
      targetProjectId: cluster.projectId.toString(),
      targetOrgId: cluster.orgId.toString(),
      payload: { reason },
    });

    return cluster;
  }

  async markAsPaused(clusterId: string): Promise<ClusterDocument> {
    const cluster = await this.clusterModel.findByIdAndUpdate(
      clusterId,
      { 
        $set: { 
          status: 'paused' as ClusterStatus,
          pausedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    return cluster;
  }

  async markAsResumed(clusterId: string): Promise<ClusterDocument> {
    const cluster = await this.clusterModel.findByIdAndUpdate(
      clusterId,
      { 
        $set: { 
          status: 'ready' as ClusterStatus,
        },
        $unset: {
          pausedAt: 1,
          pauseReason: 1,
        },
      },
      { new: true },
    ).exec();

    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    return cluster;
  }

  async clone(
    sourceClusterId: string,
    targetProjectId: string,
    newName: string,
    newPlan?: string,
  ): Promise<Cluster> {
    const source = await this.findById(sourceClusterId);
    if (!source) {
      throw new NotFoundException('Source cluster not found');
    }

    // Generate new credentials for clone
    const credentials = await this.credentialsService.generateCredentials();

    // Create cloned cluster
    const clone = new this.clusterModel({
      projectId: targetProjectId,
      orgId: source.orgId,
      name: newName,
      plan: newPlan || source.plan,
      mongoVersion: source.mongoVersion,
      region: source.region,
      replicaSetName: `rs-${Date.now()}`,
      credentialsEncrypted: credentials.encrypted,
      status: 'creating',
      clonedFrom: sourceClusterId,
    });

    await clone.save();

    // Create clone job
    await this.jobsService.createJob({
      type: 'CREATE_CLUSTER',
      targetClusterId: clone.id,
      targetProjectId,
      targetOrgId: source.orgId.toString(),
      payload: {
        isClone: true,
        sourceClusterId,
        sourceHost: source.connectionHost,
        sourcePort: source.connectionPort,
      },
    });

    return clone;
  }

  private canModifyCluster(status: ClusterStatus): boolean {
    return status === 'ready' || status === 'degraded';
  }

  private buildConnectionString(
    cluster: ClusterDocument,
    credentials: { username: string; password: string },
  ): string {
    if (!cluster.connectionHost) {
      return 'pending';
    }
    return `mongodb://${credentials.username}:${credentials.password}@${cluster.connectionHost}:${cluster.connectionPort || 27017}/${cluster.name}?authSource=admin`;
  }
}

