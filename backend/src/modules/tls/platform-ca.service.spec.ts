import * as tls from 'tls';
import { X509Certificate } from 'crypto';
import { AddressInfo } from 'net';
import { PlatformCaService } from './platform-ca.service';

describe('PlatformCaService', () => {
  const docs = new Map<string, any>();
  const connection: any = {
    collection: () => ({
      findOne: async ({ _id }: any) => docs.get(_id) ?? null,
      insertOne: async (doc: any) => {
        if (docs.has(doc._id)) throw Object.assign(new Error('dup'), { code: 11000 });
        docs.set(doc._id, doc);
      },
    }),
  };
  const credentials: any = { encryptString: (s: string) => `enc:${s}`, decryptString: (s: string) => s.slice(4) };
  let service: PlatformCaService;

  beforeAll(() => {
    service = new PlatformCaService(connection, credentials);
  });

  it('creates the CA once and stores its key encrypted', async () => {
    const pem = await service.getCaPem();
    expect(pem).toContain('BEGIN CERTIFICATE');
    expect(docs.get('platform-ca').keyEncrypted.startsWith('enc:')).toBe(true);
    // A second instance (other replica) loads the same CA.
    expect(await new PlatformCaService(connection, credentials).getCaPem()).toBe(pem);
    expect(new X509Certificate(pem).ca).toBe(true);
  }, 60_000);

  it('issues a server certificate trusted via the CA for internal and external names', async () => {
    const issued = await service.issueServerCertificate({
      commonName: 'aihub-prod-x7k2ab.db.eutlas.eu',
      dnsNames: [
        '*.aihub-prod-x7k2ab.db.eutlas.eu',
        'mongo-abc-0.mongo-abc-svc.eutlas-p1.svc.cluster.local',
      ],
    });
    const leaf = new X509Certificate(issued.certPem);
    expect(leaf.verify(new X509Certificate(issued.caPem).publicKey)).toBe(true);
    expect(leaf.subjectAltName).toContain('DNS:mongo-abc-0.mongo-abc-svc.eutlas-p1.svc.cluster.local');
    expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(390 * 86_400_000);

    // Real TLS handshake: client trusts only the platform CA and checks the external hostname.
    const server = tls.createServer({ cert: issued.certPem, key: issued.keyPem }, (s) => s.end('ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const connect = (servername: string) =>
      new Promise<string>((resolve, reject) => {
        const socket = tls.connect({ host: '127.0.0.1', port, servername, ca: issued.caPem }, () => {
          socket.once('data', (d) => resolve(d.toString()));
        });
        socket.on('error', reject);
      });
    try {
      await expect(connect('m0.aihub-prod-x7k2ab.db.eutlas.eu')).resolves.toBe('ok');
      await expect(connect('evil.example.com')).rejects.toThrow(/altnames|Hostname/i);
    } finally {
      server.close();
    }
  }, 60_000);
});
