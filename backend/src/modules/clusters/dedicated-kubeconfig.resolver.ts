import { Inject, Injectable, Logger, OnModuleInit, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cluster, ClusterDocument } from './schemas/cluster.schema';
import { CredentialsService } from '../credentials/credentials.service';
import { KubernetesService } from '../kubernetes/kubernetes.service';

const CACHE_TTL_MS = 60_000;

/**
 * Tells KubernetesService where a cluster lives: every cluster runs on its own
 * dedicated node, and day-2 operations (users, network policy, status, pause…)
 * must target that node's K3s rather than the shared control-plane cluster.
 */
@Injectable()
export class DedicatedKubeconfigResolver implements OnModuleInit {
  private readonly logger = new Logger(DedicatedKubeconfigResolver.name);
  private readonly cache = new Map<string, { kubeconfig?: string; expiresAt: number }>();

  constructor(
    @InjectModel(Cluster.name) private readonly clusterModel: Model<ClusterDocument>,
    @Inject(forwardRef(() => CredentialsService)) private readonly credentialsService: CredentialsService,
    private readonly kubernetesService: KubernetesService,
  ) {}

  onModuleInit(): void {
    this.kubernetesService.setDedicatedKubeconfigResolver((clusterId) => this.resolve(clusterId));
  }

  async resolve(clusterId: string): Promise<string | undefined> {
    const cached = this.cache.get(clusterId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.kubeconfig;
    }

    const cluster = await this.clusterModel
      .findById(clusterId)
      .select({ dedicatedKubeconfigEncrypted: 1 })
      .lean()
      .exec();

    let kubeconfig: string | undefined;
    if (cluster?.dedicatedKubeconfigEncrypted) {
      try {
        kubeconfig = this.credentialsService.decryptString(cluster.dedicatedKubeconfigEncrypted);
      } catch (error: any) {
        // Fail loudly: silently falling back to the shared cluster would apply
        // changes (e.g. network policy) to the wrong place.
        this.logger.error(`Cannot decrypt dedicated kubeconfig of cluster ${clusterId}: ${error.message}`);
        throw error;
      }
    }

    this.cache.set(clusterId, { kubeconfig, expiresAt: Date.now() + CACHE_TTL_MS });
    return kubeconfig;
  }
}
