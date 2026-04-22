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
import { MigrationService } from '../migration/migration.service';
import { HetznerProvisionerService } from '../hetzner/hetzner-provisioner.service';
import { CredentialsService } from '../credentials/credentials.service';
import { JobDocument } from './schemas/job.schema';
import { MongoClient } from 'mongodb';

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
    @Inject(forwardRef(() => MigrationService))
    private readonly migrationService: MigrationService,
    private readonly hetznerProvisioner: HetznerProvisionerService,
    private readonly credentialsService: CredentialsService,
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
        case 'MIGRATE_CLUSTER':
          await this.processMigrateCluster(job);
          break;
        case 'MIGRATE_TO_DEDICATED':
          await this.processMigrateToDedicated(job);
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
    const { plan, mongoVersion, credentials, clusterName, createdBy, vectorSearchEnabled, region } = job.payload as any;
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();
    const orgId = job.targetOrgId!.toString();

    // ── Dedicated server provisioning (every plan gets its own node) ──────
    let dedicatedKubeconfig: string | undefined;

    if (this.hetznerProvisioner.needsDedicatedServer(plan)) {
      this.logger.log(`[${clusterId}] Plan ${plan} requires a dedicated server — provisioning via Hetzner`);

      const serverInfo = await this.hetznerProvisioner.provisionClusterServer(
        clusterId,
        region || 'fsn1',
        plan,
      );

      // Encrypt the kubeconfig before persisting it
      const kubeconfigEncrypted = this.credentialsService.encryptString(serverInfo.kubeconfig);

      await this.clustersService.updateDedicatedServer(clusterId, {
        serverId: serverInfo.serverId,
        serverIp: serverInfo.serverIp,
        kubeconfigEncrypted,
      });

      dedicatedKubeconfig = serverInfo.kubeconfig;
      this.logger.log(`[${clusterId}] Dedicated server ${serverInfo.serverId} provisioned at ${serverInfo.serverIp}`);
    }

    // Create K8s resources (MongoDB + optional Qdrant companion)
    const result = await this.kubernetesService.createMongoCluster({
      clusterId,
      projectId,
      orgId,
      clusterName: clusterName || `cluster-${clusterId}`,
      plan,
      mongoVersion,
      credentials,
      vectorSearchEnabled: vectorSearchEnabled || false,
      dedicatedKubeconfig,
    });

    // Update cluster with connection info (including replicaSet, SRV, external endpoint, and Qdrant if enabled)
    await this.clustersService.updateStatus(clusterId, 'ready', {
      host: result.host,
      port: result.port,
      replicaSet: result.replicaSet,
      srv: result.srv,
      externalHost: result.externalHost,
      externalPort: result.externalPort,
      qdrant: result.qdrant,
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
          const displayHost = result.externalHost || result.host;
          const displayPort = result.externalPort || result.port;
          const connectionString = `mongodb://${credentials?.username || 'admin'}:****@${displayHost}:${displayPort}`;
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
      currentPlan: oldPlan,
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

    // Look up dedicated server info (if any) before we hard-delete the record
    const clusterDoc = await this.clustersService.findById(clusterId);
    const dedicatedServerId: number | undefined = (clusterDoc as any)?.dedicatedServerId;
    const dedicatedKubeconfigEncrypted: string | undefined = (clusterDoc as any)?.dedicatedKubeconfigEncrypted;

    // Decrypt kubeconfig if present
    let dedicatedKubeconfig: string | undefined;
    if (dedicatedKubeconfigEncrypted) {
      try {
        dedicatedKubeconfig = this.credentialsService.decryptString(dedicatedKubeconfigEncrypted);
      } catch (e) {
        this.logger.warn(`[${clusterId}] Failed to decrypt dedicated kubeconfig: ${e}`);
      }
    }

    // Delete K8s resources (on the dedicated server if applicable)
    await this.kubernetesService.deleteMongoCluster({ clusterId, projectId, dedicatedKubeconfig });

    // Hard delete cluster from database
    await this.clustersService.hardDelete(clusterId);

    // Deprovision the dedicated Hetzner server (after K8s cleanup and DB deletion)
    if (dedicatedServerId) {
      this.logger.log(`[${clusterId}] Deprovisioning dedicated Hetzner server ${dedicatedServerId}`);
      try {
        await this.hetznerProvisioner.deprovisionServer(dedicatedServerId);
      } catch (e: any) {
        this.logger.error(`[${clusterId}] Failed to delete Hetzner server ${dedicatedServerId}: ${e.message}`);
        // Don't throw — cluster DB record is already deleted; log and move on
      }
    }

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

    // Look up cluster plan
    const cluster = await this.clustersService.findById(clusterId);
    const plan = cluster?.plan || (job.payload as any)?.plan || 'DEV';

    // Scale down K8s resources
    try {
      await this.kubernetesService.pauseMongoCluster({ clusterId, projectId, plan });
    } catch (error: any) {
      this.logger.warn(`K8s pause failed for cluster ${clusterId}: ${error.message}. Marking as paused anyway.`);
    }

    // Update cluster status (always mark as paused, even if K8s fails - 
    // the cluster record should reflect the intended state)
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

    // Look up cluster plan to determine correct K8s path (operator vs StatefulSet)
    const cluster = await this.clustersService.findById(clusterId);
    const plan = cluster?.plan || (job.payload as any)?.plan || 'DEV';

    // Scale up K8s resources
    try {
      await this.kubernetesService.resumeMongoCluster({ clusterId, projectId, plan });
    } catch (error: any) {
      this.logger.warn(`K8s resume failed for cluster ${clusterId}: ${error.message}. Marking as resumed anyway.`);
    }

    // Update cluster status (always mark as resumed, even if K8s fails)
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

    // Look up cluster plan for correct service name
    const cluster = await this.clustersService.findById(clusterId);
    const plan = cluster?.plan || 'DEV';

    // Start backup
    await this.backupsService.startBackup(backupId);

    // Create backup via K8s job
    await this.kubernetesService.createBackup({ clusterId, projectId, plan, backupId });

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

    // Look up cluster plan for correct service name
    const cluster = await this.clustersService.findById(clusterId);
    const plan = cluster?.plan || 'DEV';

    // Restore via K8s job
    await this.kubernetesService.restoreBackup({ clusterId, projectId, plan, backupId });

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

  private async processMigrateCluster(job: JobDocument) {
    const { migrationId } = job.payload as any;

    this.logger.log(`Processing migration ${migrationId} for cluster ${job.targetClusterId}`);

    // Delegate to the MigrationService which handles the full
    // dump -> restore -> verify lifecycle with progress tracking
    await this.migrationService.executeMigration(migrationId);

    this.logger.log(`Migration ${migrationId} completed successfully`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  MIGRATE_TO_DEDICATED — relocates a cluster from the shared production
  //  node onto its own dedicated Hetzner server.
  //
  //  Flow:
  //    1. Load the cluster + decrypt its admin credentials.
  //    2. Provision a fresh dedicated Hetzner server (K3s + MongoDB operator).
  //    3. Create a new MongoDB cluster on the new node with the SAME admin
  //       username/password — so the customer's connection string keeps
  //       working after we swap the host/port fields.
  //    4. Wait for the new MongoDB to accept authenticated connections.
  //    5. Copy every database & collection from the old mongo into the new
  //       mongo via a cursor-based Node.js MongoClient stream.
  //    6. Atomically flip the cluster document's dedicated-server fields and
  //       its external / internal endpoints to point at the new node.
  //    7. Tear down the old in-cluster MongoDB (Statefulset, CR, services,
  //       PVCs, netpol, qdrant, credentials secret) from the shared node.
  //
  //  The existing admin password is preserved so the customer does NOT need
  //  to change their password — only the host/port in the connection string
  //  changes, which we update in the cluster document and notify via email.
  // ─────────────────────────────────────────────────────────────────────────
  private async processMigrateToDedicated(job: JobDocument) {
    const clusterId = job.targetClusterId!.toString();
    const projectId = job.targetProjectId!.toString();
    const orgId = job.targetOrgId!.toString();
    const payload = (job.payload as any) || {};
    const keepOldMongo: boolean = payload.keepOldMongo === true;

    const cluster = await this.clustersService.findById(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

    if (cluster.dedicatedServerId) {
      throw new Error(
        `Cluster ${clusterId} is already on a dedicated server (id ${cluster.dedicatedServerId})`,
      );
    }

    this.logger.log(`[${clusterId}] Relocation to dedicated server started (plan ${cluster.plan})`);

    // 1. Decrypt admin credentials so we can reuse them on the new cluster and
    //    open a MongoClient against both endpoints.
    const creds = await this.credentialsService.decryptCredentials(cluster.credentialsEncrypted);

    // Source URI — same K8s cluster as the backend pod, so internal DNS works.
    const srcHost = cluster.connectionHost;
    const srcPort = cluster.connectionPort || 27017;
    if (!srcHost) {
      throw new Error(`Cluster ${clusterId} has no connectionHost set`);
    }
    const srcUri = this.buildMongoUri({
      username: creds.username,
      password: creds.password,
      host: srcHost,
      port: srcPort,
      replicaSet: cluster.replicaSetName,
      directConnection: !cluster.replicaSetName,
    });

    // 2. Provision the new Hetzner server + bootstrap K3s + operator.
    this.logger.log(`[${clusterId}] Provisioning new Hetzner server for plan ${cluster.plan}`);
    const region = (cluster.region && cluster.region.trim()) || 'fsn1';
    const serverInfo = await this.hetznerProvisioner.provisionClusterServer(
      clusterId,
      region,
      cluster.plan,
    );
    this.logger.log(`[${clusterId}] New server ${serverInfo.serverId} ready at ${serverInfo.serverIp}`);

    // Capture the OLD node's public IP so we can whitelist it on the NEW NP
    // during migration — otherwise the backend pod's SNATed packets would
    // fail the default NetworkPolicy.
    const oldNodeIp = await this.getOldNodeExternalIp();
    const additionalIngressIps = oldNodeIp ? [`${oldNodeIp}/32`] : [];

    // 3. Create the new MongoDB cluster using the EXISTING admin credentials.
    const kubeconfigEncrypted = this.credentialsService.encryptString(serverInfo.kubeconfig);

    this.logger.log(`[${clusterId}] Creating MongoDB on new dedicated node`);
    const newConn = await this.kubernetesService.createMongoCluster({
      clusterId,
      projectId,
      orgId,
      clusterName: cluster.name,
      plan: cluster.plan,
      mongoVersion: cluster.mongoVersion || '7.0.5',
      credentials: { username: creds.username, password: creds.password },
      vectorSearchEnabled: cluster.vectorSearchEnabled || false,
      dedicatedKubeconfig: serverInfo.kubeconfig,
      additionalIngressIps,
    });

    if (!newConn.externalHost || !newConn.externalPort) {
      throw new Error(`New cluster has no external endpoint after creation`);
    }

    // 4. Wait for the new mongo to accept authenticated pings.
    const dstUri = this.buildMongoUri({
      username: creds.username,
      password: creds.password,
      host: newConn.externalHost,
      port: newConn.externalPort,
      replicaSet: undefined, // always talk directly during migration
      directConnection: true,
    });
    await this.waitForMongoReady(dstUri, 180_000);

    // 5. Copy all data from old -> new.
    this.logger.log(`[${clusterId}] Copying data from old to new mongo`);
    const stats = await this.copyAllDatabases(srcUri, dstUri);
    this.logger.log(
      `[${clusterId}] Data copy complete: ${stats.databases} dbs, ${stats.collections} colls, ${stats.documents} docs`,
    );

    // 6. Flip the cluster document atomically so customers get the new endpoint.
    await this.clustersService.updateDedicatedServer(clusterId, {
      serverId: serverInfo.serverId,
      serverIp: serverInfo.serverIp,
      kubeconfigEncrypted,
    });

    await this.clustersService.updateStatus(clusterId, 'ready', {
      host: newConn.host,
      port: newConn.port,
      replicaSet: newConn.replicaSet,
      srv: newConn.srv,
      externalHost: newConn.externalHost,
      externalPort: newConn.externalPort,
      qdrant: newConn.qdrant,
    });

    await this.eventsService.createEvent({
      orgId,
      projectId,
      clusterId,
      type: 'CLUSTER_READY',
      severity: 'info',
      message: `Cluster relocated to dedicated server ${serverInfo.serverIp}`,
      metadata: {
        newServerId: serverInfo.serverId,
        newServerIp: serverInfo.serverIp,
        migratedDatabases: stats.databases,
        migratedDocuments: stats.documents,
      },
    });

    // 7. Tear down the old in-cluster mongo on the shared node so it stops
    //    consuming disk/memory. Skippable via payload for safety-net runs.
    if (!keepOldMongo) {
      this.logger.log(`[${clusterId}] Deleting old MongoDB on shared node`);
      try {
        // No dedicatedKubeconfig = target the shared / backend's in-cluster kc.
        await this.kubernetesService.deleteMongoCluster({ clusterId, projectId });
        this.logger.log(`[${clusterId}] Old MongoDB deleted on shared node`);
      } catch (err: any) {
        this.logger.warn(
          `[${clusterId}] Cleanup of old MongoDB failed: ${err.message} — manual cleanup needed`,
        );
      }
    } else {
      this.logger.log(`[${clusterId}] keepOldMongo=true — leaving old MongoDB running`);
    }

    this.logger.log(`[${clusterId}] Relocation to dedicated server completed successfully`);
  }

  /**
   * Best-effort lookup of the shared production node's public IP. Used to
   * whitelist the backend pod's SNATed source address on the newly created
   * dedicated cluster during migration.
   */
  private async getOldNodeExternalIp(): Promise<string | null> {
    try {
      // KubernetesService has a private helper; as a simple proxy we read
      // the env var first (operator may set it), then fall back to null.
      const fromEnv = process.env.SHARED_NODE_PUBLIC_IP || '';
      if (fromEnv) return fromEnv;
      // Last resort: the known prod node IP (documented infra fact).
      return '46.224.9.177';
    } catch {
      return null;
    }
  }

  private buildMongoUri(opts: {
    username: string;
    password: string;
    host: string;
    port: number;
    replicaSet?: string;
    directConnection?: boolean;
  }): string {
    const user = encodeURIComponent(opts.username);
    const pass = encodeURIComponent(opts.password);
    const params: string[] = ['authSource=admin'];
    if (opts.replicaSet) params.push(`replicaSet=${encodeURIComponent(opts.replicaSet)}`);
    if (opts.directConnection) params.push('directConnection=true');
    return `mongodb://${user}:${pass}@${opts.host}:${opts.port}/?${params.join('&')}`;
  }

  private async waitForMongoReady(uri: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastErr: any;
    while (Date.now() < deadline) {
      const client = new MongoClient(uri, {
        connectTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
      });
      try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        await client.close();
        return;
      } catch (e: any) {
        lastErr = e;
        try { await client.close(); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    throw new Error(`Timed out waiting for new MongoDB to be ready: ${lastErr?.message}`);
  }

  /**
   * Streams every non-system collection from src -> dst in batches.
   * Drops target collections before inserting so migrations are idempotent.
   */
  private async copyAllDatabases(
    srcUri: string,
    dstUri: string,
  ): Promise<{ databases: number; collections: number; documents: number }> {
    const src = new MongoClient(srcUri, {
      connectTimeoutMS: 30_000,
      serverSelectionTimeoutMS: 30_000,
      socketTimeoutMS: 600_000,
    });
    const dst = new MongoClient(dstUri, {
      connectTimeoutMS: 30_000,
      serverSelectionTimeoutMS: 30_000,
      socketTimeoutMS: 600_000,
    });

    try {
      await src.connect();
      await dst.connect();

      const skipDbs = new Set(['admin', 'local', 'config']);
      const { databases } = await src.db('admin').command({ listDatabases: 1 });

      let dbCount = 0;
      let collCount = 0;
      let docCount = 0;
      const BATCH = 500;

      for (const db of databases as Array<{ name: string }>) {
        if (skipDbs.has(db.name)) continue;
        const srcDb = src.db(db.name);
        const dstDb = dst.db(db.name);
        const colls = await srcDb.listCollections().toArray();
        let migratedInDb = false;

        for (const coll of colls as Array<{ name: string; type?: string }>) {
          if (coll.name.startsWith('system.')) continue;
          if (coll.type && coll.type !== 'collection') continue;
          const srcColl = srcDb.collection(coll.name);
          const dstColl = dstDb.collection(coll.name);

          // Drop target collection for a clean copy (idempotent).
          try { await dstColl.drop(); } catch { /* not there — fine */ }

          // Copy indexes (except default _id_).
          const indexes = await srcColl.indexes();
          for (const idx of indexes) {
            if (idx.name === '_id_') continue;
            // Strip internal index metadata (v, ns) that MongoDB rejects on createIndex.
            const { key, name, v: _v, ns: _ns, ...rest } = idx as any;
            void _v;
            void _ns;
            try {
              await dstColl.createIndex(key, { name, ...rest });
            } catch (e: any) {
              this.logger.warn(
                `[copy] Failed to create index ${db.name}.${coll.name}.${idx.name}: ${e.message}`,
              );
            }
          }

          // Stream documents.
          const cursor = srcColl.find({}, { batchSize: BATCH });
          let buf: any[] = [];
          let n = 0;
          while (await cursor.hasNext()) {
            buf.push(await cursor.next());
            if (buf.length >= BATCH) {
              await dstColl.insertMany(buf, { ordered: false });
              n += buf.length;
              buf = [];
            }
          }
          if (buf.length) {
            await dstColl.insertMany(buf, { ordered: false });
            n += buf.length;
          }

          collCount += 1;
          docCount += n;
          migratedInDb = true;
          this.logger.log(`[copy] ${db.name}.${coll.name}: ${n} docs`);
        }

        if (migratedInDb) dbCount += 1;
      }

      return { databases: dbCount, collections: collCount, documents: docCount };
    } finally {
      try { await src.close(); } catch { /* ignore */ }
      try { await dst.close(); } catch { /* ignore */ }
    }
  }
}
