import { Types } from 'mongoose';
import { ClusterTlsService, dnsLabelFor } from './cluster-tls.service';

describe('ClusterTlsService', () => {
  const clusterId = new Types.ObjectId('6a248667d84fab3fe888d269').toString();
  let cluster: any;
  let kubernetes: any;
  let dns: any;
  let ca: any;
  let service: ClusterTlsService;

  beforeEach(() => {
    cluster = {
      _id: clusterId,
      name: 'AIHUB Staging',
      plan: 'LARGE',
      status: 'ready',
      projectId: new Types.ObjectId(),
      save: jest.fn(),
    };
    kubernetes = {
      memberHostWildcard: jest.fn().mockReturnValue('*.mongo-x-svc.eutlas-p.svc.cluster.local'),
      configureClusterTls: jest.fn().mockResolvedValue({
        replicaSet: 'mongo-6a248667d84fab3fe888d269',
        members: [
          { index: 0, host: '178.105.121.60', port: 31001 },
          { index: 1, host: '159.69.10.20', port: 31002 },
        ],
      }),
    };
    dns = {
      enabled: true,
      clusterName: (label: string) => `${label}.db`,
      fqdn: (name: string) => `${name}.eutlas.eu`,
      setRecords: jest.fn().mockResolvedValue(undefined),
    };
    ca = {
      issueServerCertificate: jest.fn().mockResolvedValue({
        certPem: 'C', keyPem: 'K', caPem: 'CA', expiresAt: new Date('2027-11-14'),
      }),
    };
    const model: any = { findById: () => ({ exec: async () => cluster }) };
    service = new ClusterTlsService(model, kubernetes, dns, ca);
  });

  it('derives a DNS-safe label with an id suffix', () => {
    expect(dnsLabelFor('AIHUB Staging', clusterId)).toBe('aihub-staging-88d269');
    expect(dnsLabelFor('---', clusterId)).toBe('cluster-88d269');
  });

  it('issues a certificate for public and in-cluster names and publishes member, SRV and TXT records', async () => {
    const result = await service.enable(clusterId, 'optional');

    const base = 'aihub-staging-88d269.db.eutlas.eu';
    expect(ca.issueServerCertificate).toHaveBeenCalledWith({
      commonName: base,
      dnsNames: [base, `*.${base}`, '*.mongo-x-svc.eutlas-p.svc.cluster.local'],
    });
    expect(kubernetes.configureClusterTls).toHaveBeenCalledWith(
      expect.objectContaining({ dnsBase: base, mode: 'optional', certPem: 'C', keyPem: 'K', caPem: 'CA' }),
    );
    expect(dns.setRecords).toHaveBeenCalledWith('m0.aihub-staging-88d269.db', 'A', ['178.105.121.60']);
    expect(dns.setRecords).toHaveBeenCalledWith('m1.aihub-staging-88d269.db', 'A', ['159.69.10.20']);
    expect(dns.setRecords).toHaveBeenCalledWith('_mongodb._tcp.aihub-staging-88d269.db', 'SRV', [
      `0 0 31001 m0.${base}.`,
      `0 0 31002 m1.${base}.`,
    ]);
    expect(dns.setRecords).toHaveBeenCalledWith('aihub-staging-88d269.db', 'TXT', [
      '"authSource=admin&replicaSet=mongo-6a248667d84fab3fe888d269"',
    ]);
    expect(cluster.dnsLabel).toBe('aihub-staging-88d269');
    expect(cluster.tlsMode).toBe('optional');
    expect(cluster.save).toHaveBeenCalled();
    expect(result.members).toEqual([
      { host: `m0.${base}`, port: 31001 },
      { host: `m1.${base}`, port: 31002 },
    ]);
  });

  it('keeps an existing label when re-run (e.g. renewal)', async () => {
    cluster.dnsLabel = 'aihub-old-label';
    await service.enable(clusterId, 'required');
    expect(dns.setRecords).toHaveBeenCalledWith('m0.aihub-old-label.db', 'A', ['178.105.121.60']);
  });

  it('refuses clusters that are not ready', async () => {
    cluster.status = 'creating';
    await expect(service.enable(clusterId, 'optional')).rejects.toThrow(/ready/);
  });
});
