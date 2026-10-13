import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { MongoClient } from 'mongodb';
import { Connection, Types } from 'mongoose';
import { KubernetesService, PlatformDiagnostics } from '../kubernetes/kubernetes.service';
import { CredentialsService } from '../credentials/credentials.service';
import { JobsService } from '../jobs/jobs.service';

// A scheduled backup older than this means the schedule is not being kept.
const BACKUP_STALE_HOURS = 26;

/**
 * Cross-tenant operations for the admin MCP: inventory, platform health,
 * who connects to a cluster, and stuck job handling.
 */
@Injectable()
export class AdminOpsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly kubernetesService: KubernetesService,
    @Inject(forwardRef(() => CredentialsService)) private readonly credentialsService: CredentialsService,
    @Inject(forwardRef(() => JobsService)) private readonly jobsService: JobsService,
  ) {}

  async listClusters(filter: { status?: string; orgId?: string }) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.orgId && Types.ObjectId.isValid(filter.orgId)) query.orgId = new Types.ObjectId(filter.orgId);

    const clusters = await this.connection
      .collection('clusters')
      .find(query, {
        projection: {
          name: 1, plan: 1, status: 1, region: 1, mongoVersion: 1, orgId: 1, projectId: 1,
          dedicatedServerId: 1, dedicatedServerIp: 1, externalHost: 1, externalPort: 1,
          failureReason: 1, createdAt: 1,
        },
      })
      .sort({ createdAt: -1 })
      .toArray();

    const names = async (collection: string, ids: unknown[]) =>
      new Map(
        (await this.connection.collection(collection).find({ _id: { $in: ids as any[] } }, { projection: { name: 1 } }).toArray())
          .map((d) => [d._id.toString(), d.name as string]),
      );
    const orgNames = await names('organizations', clusters.map((c) => c.orgId));
    const projectNames = await names('projects', clusters.map((c) => c.projectId));

    return clusters.map(({ _id, ...c }) => ({
      id: _id.toString(),
      ...c,
      orgId: c.orgId?.toString(),
      orgName: orgNames.get(c.orgId?.toString()),
      projectId: c.projectId?.toString(),
      projectName: projectNames.get(c.projectId?.toString()),
    }));
  }

  async diagnostics(): Promise<
    PlatformDiagnostics & {
      backups: Array<{ clusterId: string; clusterName: string; lastCompletedAt?: Date; lastSizeBytes?: number; stale: boolean; lastError?: string }>;
      stuckJobs: Array<{ id: string; type: string; status: string; targetClusterId?: string; ageMinutes: number }>;
    }
  > {
    const platform = await this.kubernetesService.getPlatformDiagnostics();
    const now = Date.now();

    const clusters = await this.connection
      .collection('clusters')
      .find({ status: { $in: ['ready', 'degraded'] } }, { projection: { name: 1 } })
      .toArray();
    const enabled = new Set(
      (await this.connection.collection('backuppolicies').find({ isEnabled: true }, { projection: { clusterId: 1 } }).toArray())
        .map((p) => p.clusterId.toString()),
    );
    const backups = await Promise.all(
      clusters.map(async (cluster) => {
        const [completed, failed] = await Promise.all([
          this.connection.collection('backups').findOne(
            { clusterId: cluster._id, status: 'completed' },
            { sort: { completedAt: -1 }, projection: { completedAt: 1, sizeBytes: 1 } },
          ),
          this.connection.collection('backups').findOne(
            { clusterId: cluster._id, status: 'failed' },
            { sort: { createdAt: -1 }, projection: { createdAt: 1, errorMessage: 1 } },
          ),
        ]);
        const lastCompletedAt: Date | undefined = completed?.completedAt;
        const stale =
          enabled.has(cluster._id.toString()) &&
          (!lastCompletedAt || now - new Date(lastCompletedAt).getTime() > BACKUP_STALE_HOURS * 3_600_000);
        const failedAfterSuccess = failed && (!lastCompletedAt || failed.createdAt > lastCompletedAt);
        return {
          clusterId: cluster._id.toString(),
          clusterName: cluster.name,
          lastCompletedAt,
          lastSizeBytes: completed?.sizeBytes,
          stale,
          lastError: failedAfterSuccess ? failed.errorMessage : undefined,
        };
      }),
    );

    const stuck = await this.connection
      .collection('jobs')
      .find({
        $or: [
          { status: 'in_progress', startedAt: { $lte: new Date(now - 2 * 3_600_000) } },
          { status: 'pending', createdAt: { $lte: new Date(now - 3_600_000) } },
        ],
      })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();

    return {
      ...platform,
      backups,
      stuckJobs: stuck.map((j) => ({
        id: j._id.toString(),
        type: j.type,
        status: j.status,
        targetClusterId: j.targetClusterId?.toString(),
        ageMinutes: Math.round((now - new Date(j.startedAt ?? j.createdAt).getTime()) / 60_000),
      })),
    };
  }

  /** External client IPs connected to a cluster (in-cluster/replication traffic is summarised). */
  async clusterConnections(clusterId: string) {
    if (!Types.ObjectId.isValid(clusterId)) throw new NotFoundException('Cluster not found');
    const cluster = await this.connection.collection('clusters').findOne({ _id: new Types.ObjectId(clusterId) });
    if (!cluster) throw new NotFoundException('Cluster not found');

    const creds = await this.credentialsService.decryptCredentials(cluster.credentialsEncrypted);
    const auth = `${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password)}`;
    const host = cluster.dedicatedServerId && cluster.externalHost
      ? `${cluster.externalHost}:${cluster.externalPort}`
      : `${cluster.connectionHost}:${cluster.connectionPort || 27017}`;
    const client = new MongoClient(`mongodb://${auth}@${host}/?authSource=admin&directConnection=true`, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });

    try {
      await client.connect();
      const ops = await client
        .db('admin')
        .aggregate([{ $currentOp: { allUsers: true, idleConnections: true, localOps: false } }])
        .toArray();
      const external = new Map<string, { connections: number; apps: Set<string> }>();
      let internal = 0;
      for (const op of ops) {
        if (!op.client) continue;
        const ip = String(op.client).replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
        if (/^(10\.|127\.)/.test(ip)) {
          internal += 1;
          continue;
        }
        const md = op.clientMetadata || {};
        const app = op.appName || md.application?.name || md.driver?.name || 'unknown';
        const entry = external.get(ip) ?? { connections: 0, apps: new Set<string>() };
        entry.connections += 1;
        entry.apps.add(app);
        external.set(ip, entry);
      }
      const accessList = await this.connection
        .collection('ipwhitelists')
        .find({ clusterId: cluster._id, isActive: true }, { projection: { cidrBlock: 1, comment: 1 } })
        .toArray();
      return {
        clusterId,
        external: [...external.entries()]
          .map(([ip, e]) => ({ ip, connections: e.connections, apps: [...e.apps] }))
          .sort((a, b) => b.connections - a.connections),
        internalConnections: internal,
        accessList: accessList.map((e) => ({ cidrBlock: e.cidrBlock, comment: e.comment })),
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async listJobs(filter: { status?: string; clusterId?: string; limit?: number }) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.clusterId && Types.ObjectId.isValid(filter.clusterId)) {
      query.targetClusterId = new Types.ObjectId(filter.clusterId);
    }
    const jobs = await this.connection
      .collection('jobs')
      .find(query, { projection: { payload: 0 } })
      .sort({ createdAt: -1 })
      .limit(Math.min(filter.limit ?? 50, 200))
      .toArray();
    return jobs.map(({ _id, ...j }) => ({ id: _id.toString(), ...j }));
  }

  async retryJob(jobId: string) {
    const job = await this.jobsService.retryJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async failJob(jobId: string, reason?: string) {
    const job = await this.jobsService.failJob(jobId, reason || 'Marked failed by platform admin', false);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }
}
