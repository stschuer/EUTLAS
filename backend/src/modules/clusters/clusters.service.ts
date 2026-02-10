import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Cluster, ClusterDocument, ClusterStatus, ClusterPlan } from './schemas/cluster.schema';
import { CreateClusterDto } from './dto/create-cluster.dto';
import { ResizeClusterDto } from './dto/resize-cluster.dto';
import { UpdateClusterDto } from './dto/update-cluster.dto';
import { JobsService } from '../jobs/jobs.service';
import { CredentialsService } from '../credentials/credentials.service';

@Injectable()
export class ClustersService {
  private readonly logger = new Logger(ClustersService.name);

  constructor(
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    @Inject(forwardRef(() => JobsService)) private jobsService: JobsService,
    private credentialsService: CredentialsService,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(
    projectId: string,
    orgId: string,
    createClusterDto: CreateClusterDto,
    createdBy?: string,
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
      mongoVersion: createClusterDto.mongoVersion || '7.0.5',
      status: 'creating' as ClusterStatus,
      credentialsEncrypted: credentials.encrypted,
      vectorSearchEnabled: createClusterDto.enableVectorSearch || false,
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
        clusterName: createClusterDto.name,
        createdBy,
        vectorSearchEnabled: createClusterDto.enableVectorSearch || false,
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
        externalHost: cluster.externalHost || null,
        externalPort: cluster.externalPort || 27017,
        externalConnectionString: this.buildExternalConnectionString(cluster, credentials),
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
    connectionInfo?: {
      host: string;
      port: number;
      replicaSet?: string;
      srv?: string;
      externalHost?: string;
      externalPort?: number;
      qdrant?: { host: string; port: number };
    },
  ): Promise<ClusterDocument> {
    const updateData: any = { status };
    
    if (connectionInfo) {
      updateData.connectionHost = connectionInfo.host;
      updateData.connectionPort = connectionInfo.port;
      if (connectionInfo.replicaSet) {
        updateData.replicaSetName = connectionInfo.replicaSet;
      }
      if (connectionInfo.srv) {
        updateData.srvHost = connectionInfo.srv;
      }
      if (connectionInfo.externalHost) {
        updateData.externalHost = connectionInfo.externalHost;
      }
      if (connectionInfo.externalPort) {
        updateData.externalPort = connectionInfo.externalPort;
      }
      if (connectionInfo.qdrant) {
        updateData.vectorDbHost = connectionInfo.qdrant.host;
        updateData.vectorDbPort = connectionInfo.qdrant.port;
      }
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

  /**
   * Hard delete cluster and ALL related data (cascade delete)
   * Called after Kubernetes resources are cleaned up
   */
  async hardDelete(clusterId: string): Promise<{ deletedCounts: Record<string, number> }> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      // Already deleted, that's OK
      return { deletedCounts: {} };
    }

    this.logger.log(`Starting cascade delete for cluster ${clusterId} (${cluster.name})`);
    const deletedCounts: Record<string, number> = {};

    // Collections that reference clusterId
    const clusterIdCollections = [
      'backups',
      'backuppolicies',
      'databaseusers',
      'ipwhitelists',
      'searchindexes',
      'vectorindexes',
      'pitrconfigs',
      'pitrrestores',
      'oplogentries',
      'metrics',
      'slowqueries',
      'indexsuggestions',
      'maintenancewindows',
      'logforwardings',
      'archiverules',
      'clusterendpoints',
      'clustersettings',
      'collectionschemas',
      'alertrules',
      'alerthistories',
      'events',
      'dashboards',
    ];

    // Delete all cluster-related data
    for (const collection of clusterIdCollections) {
      try {
        const result = await this.connection.collection(collection).deleteMany({
          clusterId: cluster._id,
        });
        if (result.deletedCount > 0) {
          deletedCounts[collection] = result.deletedCount;
          this.logger.debug(`Deleted ${result.deletedCount} documents from ${collection}`);
        }
      } catch (err) {
        this.logger.debug(`Collection ${collection} not found or error: ${err.message}`);
      }
    }

    // Finally delete the cluster
    await this.clusterModel.findByIdAndDelete(clusterId).exec();
    deletedCounts['clusters'] = 1;

    this.logger.log(`Cascade delete complete for cluster ${clusterId}. Summary: ${JSON.stringify(deletedCounts)}`);
    
    return { deletedCounts };
  }

  /**
   * Update cluster properties (name, etc.)
   */
  async update(clusterId: string, updateClusterDto: UpdateClusterDto): Promise<ClusterDocument> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    if (!this.canModifyCluster(cluster.status)) {
      throw new BadRequestException({
        code: 'CLUSTER_NOT_READY',
        message: `Cannot update cluster in ${cluster.status} state`,
      });
    }

    // Check for name conflict if name is being changed
    if (updateClusterDto.name && updateClusterDto.name !== cluster.name) {
      const existing = await this.clusterModel.findOne({
        projectId: cluster.projectId,
        name: updateClusterDto.name,
        _id: { $ne: cluster._id },
      }).exec();
      
      if (existing) {
        throw new ConflictException({
          code: 'CLUSTER_NAME_EXISTS',
          message: 'A cluster with this name already exists in this project',
        });
      }
    }

    const updated = await this.clusterModel.findByIdAndUpdate(
      clusterId,
      { $set: updateClusterDto },
      { new: true },
    ).exec();

    if (!updated) {
      throw new NotFoundException('Cluster not found');
    }

    return updated;
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

    // Create pause job (include plan so the processor knows which K8s path to use)
    await this.jobsService.createJob({
      type: 'PAUSE_CLUSTER' as any,
      targetClusterId: clusterId,
      targetProjectId: cluster.projectId.toString(),
      targetOrgId: cluster.orgId.toString(),
      payload: { reason, plan: cluster.plan },
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

    // Create resume job (include plan so the processor knows which K8s path to use)
    await this.jobsService.createJob({
      type: 'RESUME_CLUSTER' as any,
      targetClusterId: clusterId,
      targetProjectId: cluster.projectId.toString(),
      targetOrgId: cluster.orgId.toString(),
      payload: { reason, plan: cluster.plan },
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

  async updateExternalEndpoint(
    clusterId: string,
    externalHost: string,
    externalPort: number,
  ): Promise<ClusterDocument | null> {
    return this.clusterModel.findByIdAndUpdate(
      clusterId,
      { $set: { externalHost, externalPort } },
      { new: true },
    ).exec();
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

    // Build SRV connection string if available (replica set / operator-managed clusters)
    if (cluster.srvHost) {
      const params = new URLSearchParams();
      params.set('authSource', 'admin');
      params.set('retryWrites', 'true');
      params.set('w', 'majority');
      if (cluster.replicaSetName) {
        params.set('replicaSet', cluster.replicaSetName);
      }
      return `mongodb+srv://${credentials.username}:${credentials.password}@${cluster.srvHost}/${cluster.name}?${params.toString()}`;
    }

    // Standard connection string with full options
    const params = new URLSearchParams();
    params.set('authSource', 'admin');
    params.set('retryWrites', 'true');
    params.set('w', 'majority');
    if (cluster.replicaSetName) {
      params.set('replicaSet', cluster.replicaSetName);
    }

    return `mongodb://${credentials.username}:${credentials.password}@${cluster.connectionHost}:${cluster.connectionPort || 27017}/${cluster.name}?${params.toString()}`;
  }

  private buildExternalConnectionString(
    cluster: ClusterDocument,
    credentials: { username: string; password: string },
  ): string {
    if (!cluster.externalHost) {
      return 'pending';
    }

    const params = new URLSearchParams();
    params.set('authSource', 'admin');
    params.set('retryWrites', 'true');
    params.set('w', 'majority');
    params.set('directConnection', 'true');

    return `mongodb://${credentials.username}:${credentials.password}@${cluster.externalHost}:${cluster.externalPort || 27017}/${cluster.name}?${params.toString()}`;
  }
}

