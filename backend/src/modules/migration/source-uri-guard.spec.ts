import { assertPublicSourceUri, isInternalAddress, sourceUriHosts } from './source-uri-guard';

describe('source URI guard', () => {
  it('extracts hosts without credentials, ports or options', () => {
    expect(sourceUriHosts('mongodb://u:p@a@h1.example.com:27017,h2.example.com/db?replicaSet=rs')).toEqual({
      srv: false,
      hosts: ['h1.example.com', 'h2.example.com'],
    });
    expect(sourceUriHosts('mongodb+srv://u:p@cluster0.abc.mongodb.net/?retryWrites=true').hosts).toEqual([
      'cluster0.abc.mongodb.net',
    ]);
    expect(sourceUriHosts('mongodb://[::1]:27017').hosts).toEqual(['::1']);
  });

  it.each(['10.0.0.5', '127.0.0.1', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.1.2.3'])(
    'treats %s as internal',
    (ip) => expect(isInternalAddress(ip)).toBe(true),
  );

  it.each(['178.105.121.60', '8.8.8.8', '172.32.0.1', '2a01:4f8::1'])('treats %s as public', (ip) =>
    expect(isInternalAddress(ip)).toBe(false),
  );

  it.each([
    'mongodb://admin:x@platform-mongodb-ha-svc.eutlas.svc.cluster.local:27017',
    'mongodb://localhost:27017',
    'mongodb://mongodb:27017',
    'mongodb://10.42.0.51:27017',
    'mongodb://169.254.169.254',
  ])('rejects internal source %s', async (uri) => {
    await expect(assertPublicSourceUri(uri)).rejects.toThrow();
  });

  it('accepts a public IP source', async () => {
    await expect(assertPublicSourceUri('mongodb://u:p@178.105.121.60:31482/db')).resolves.toBeUndefined();
  });

  it('rejects non-mongodb schemes', async () => {
    await expect(assertPublicSourceUri('http://169.254.169.254/latest')).rejects.toThrow(/mongodb/);
  });
});
