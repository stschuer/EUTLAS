import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Cluster, ClusterDocument } from '../clusters/schemas/cluster.schema';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { HetznerDnsService } from '../dns/hetzner-dns.service';
import { PlatformCaService } from './platform-ca.service';
import { Exclusive } from '../../common/scheduler-lock';

// Renew leaf certificates this long before they expire.
const RENEW_BEFORE_MS = 30 * 86_400_000;

export type TlsMode = 'optional' | 'required';

/**
 * Public endpoint + TLS for a cluster: a stable DNS name
 * (<label>.db.eutlas.eu, m<i>.<label>.db.eutlas.eu per member, SRV/TXT for
 * mongodb+srv), a platform-CA certificate covering in-cluster and public
 * member names, and the operator's TLS/horizon configuration.
 */
@Injectable()
export class ClusterTlsService {
  private readonly logger = new Logger(ClusterTlsService.name);

  constructor(
    @InjectModel(Cluster.name) private readonly clusterModel: Model<ClusterDocument>,
    private readonly kubernetes: KubernetesService,
    private readonly dns: HetznerDnsService,
    private readonly ca: PlatformCaService,
  ) {}

  async enable(clusterId: string, mode: TlsMode) {
    const cluster = await this.clusterModel.findById(clusterId).exec();
    if (!cluster) throw new NotFoundException('Cluster not found');
    if (!['ready', 'degraded'].includes(cluster.status)) {
      throw new BadRequestException(`Cluster is ${cluster.status}; TLS can only be configured on a ready cluster`);
    }
    if (!this.dns.enabled) throw new BadRequestException('Platform DNS is not configured');

    const label = cluster.dnsLabel ?? dnsLabelFor(cluster.name, clusterId);
    const projectId = cluster.projectId.toString();
    const clusterRecord = this.dns.clusterName(label); // e.g. "aihub-prod-x7k2ab.db"
    const dnsBase = this.dns.fqdn(clusterRecord); // e.g. "aihub-prod-x7k2ab.db.eutlas.eu"

    const cert = await this.ca.issueServerCertificate({
      commonName: dnsBase,
      dnsNames: [dnsBase, `*.${dnsBase}`, this.kubernetes.memberHostWildcard(clusterId, projectId)],
    });

    const topology = await this.kubernetes.configureClusterTls({
      clusterId,
      projectId,
      plan: cluster.plan,
      dnsBase,
      certPem: cert.certPem,
      keyPem: cert.keyPem,
      caPem: cert.caPem,
      mode,
    });

    for (const m of topology.members) {
      await this.dns.setRecords(`m${m.index}.${clusterRecord}`, 'A', [m.host]);
    }
    await this.dns.setRecords(
      `_mongodb._tcp.${clusterRecord}`,
      'SRV',
      topology.members.map((m) => `0 0 ${m.port} m${m.index}.${dnsBase}.`),
    );
    await this.dns.setRecords(clusterRecord, 'TXT', [`"authSource=admin&replicaSet=${topology.replicaSet}"`]);

    cluster.dnsLabel = label;
    cluster.tlsMode = mode;
    cluster.tlsCertExpiresAt = cert.expiresAt;
    await cluster.save();

    this.logger.log(`TLS ${mode} for cluster ${clusterId} at ${dnsBase} (${topology.members.length} member(s))`);
    return {
      dnsName: dnsBase,
      mode,
      members: topology.members.map((m) => ({ host: `m${m.index}.${dnsBase}`, port: m.port })),
      certificateExpiresAt: cert.expiresAt,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  @Exclusive('cluster-tls-renewal', 60 * 60_000)
  async renewExpiring(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    const due = await this.clusterModel
      .find({ tlsMode: { $in: ['optional', 'required'] }, tlsCertExpiresAt: { $lte: new Date(Date.now() + RENEW_BEFORE_MS) } })
      .select({ _id: 1, tlsMode: 1 })
      .exec();
    for (const cluster of due) {
      try {
        await this.enable(cluster._id.toString(), cluster.tlsMode as TlsMode);
      } catch (error: any) {
        this.logger.error(`TLS renewal for cluster ${cluster._id} failed: ${error.message}`);
      }
    }
  }
}

/** Stable, DNS-safe label: slugified name + id suffix (unique, not guessable from the name alone). */
export function dnsLabelFor(name: string, clusterId: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cluster';
  return `${slug}-${clusterId.slice(-6)}`;
}
