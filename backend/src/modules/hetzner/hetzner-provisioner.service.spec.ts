import axios from 'axios';
import { execFileSync } from 'child_process';
import { HetznerProvisionerService, dataVolumeSizeGb, multiSiteVolumeSizeGb } from './hetzner-provisioner.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HetznerProvisionerService', () => {
  const config: Record<string, string> = {
    HCLOUD_TOKEN: 'token',
    CREDENTIALS_ENCRYPTION_KEY: 'master-key',
  };
  let service: HetznerProvisionerService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new HetznerProvisionerService({ get: (k: string, d?: string) => config[k] ?? d } as any);
    (service as any).sleep = jest.fn().mockResolvedValue(undefined);
  });

  it('never touches Hetzner in tests, even with a real token configured', async () => {
    const testService = new HetznerProvisionerService({ get: (k: string, d?: string) => ({ ...config, NODE_ENV: 'test' } as any)[k] ?? d } as any);
    expect(testService.needsDedicatedServer('LARGE')).toBe(false);
    await expect(testService.provisionClusterServer('c1', 'fsn1', 'DEV')).rejects.toThrow(/NODE_ENV=test/);
    await expect(testService.provisionMultiSiteCluster('c1', 'LARGE')).rejects.toThrow(/NODE_ENV=test/);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  describe('multiSiteVolumeSizeGb', () => {
    it('sizes one member (data + backup staging + logs), not the three-replica budget', () => {
      expect(multiSiteVolumeSizeGb('LARGE')).toBe(50);
      expect(multiSiteVolumeSizeGb('XXXL')).toBe(410);
      expect(multiSiteVolumeSizeGb('XXXL')).toBeLessThan(dataVolumeSizeGb('XXXL'));
    });
  });

  describe('dataVolumeSizeGb', () => {
    it('sizes the volume from the plan storage budget', () => {
      expect(dataVolumeSizeGb('DEV')).toBe(15);
      expect(dataVolumeSizeGb('XXL')).toBe(400);
      expect(dataVolumeSizeGb('DEDICATED_L')).toBe(1024);
      expect(dataVolumeSizeGb('UNKNOWN')).toBe(15);
    });
  });

  describe('ensureDataVolume', () => {
    it('creates and attaches a new volume, waiting for its actions', async () => {
      mockedAxios.get.mockImplementation(async (url: string) => {
        if (url.endsWith('/v1/volumes')) return { data: { volumes: [] } };
        return { data: { action: { status: 'success' } } };
      });
      mockedAxios.post.mockResolvedValue({
        data: {
          volume: { id: 7, linux_device: '/dev/disk/by-id/scsi-0HC_Volume_7' },
          action: { id: 1 },
          next_actions: [{ id: 2 }],
        },
      });

      const volume = await (service as any).ensureDataVolume('c1', 42, 'XXL');

      expect(volume).toEqual({ id: 7, linuxDevice: '/dev/disk/by-id/scsi-0HC_Volume_7' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.hetzner.cloud/v1/volumes',
        expect.objectContaining({ name: 'eutlas-data-c1', size: 400, server: 42, automount: false }),
        expect.anything(),
      );
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.hetzner.cloud/v1/actions/1', expect.anything());
      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.hetzner.cloud/v1/actions/2', expect.anything());
    });

    it('reuses a volume already attached to the same server on retry', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { volumes: [{ id: 7, server: 42, linux_device: '/dev/x' }] },
      });

      const volume = await (service as any).ensureDataVolume('c1', 42, 'XXL');

      expect(volume.id).toBe(7);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('refuses a volume attached to a different server', async () => {
      mockedAxios.get.mockResolvedValue({ data: { volumes: [{ id: 7, server: 99 }] } });
      await expect((service as any).ensureDataVolume('c1', 42, 'XXL')).rejects.toThrow(/another server/);
    });
  });

  describe('deprovisionServer', () => {
    it('deletes the server and then its detached data volume', async () => {
      mockedAxios.delete.mockResolvedValue({});
      mockedAxios.get
        .mockResolvedValueOnce({ data: { volumes: [{ id: 7, server: 42 }] } })
        .mockResolvedValueOnce({ data: { volume: { id: 7, server: null } } });

      await service.deprovisionServer(42, 'c1');

      expect(mockedAxios.delete).toHaveBeenNthCalledWith(1, 'https://api.hetzner.cloud/v1/servers/42', expect.anything());
      expect(mockedAxios.delete).toHaveBeenNthCalledWith(2, 'https://api.hetzner.cloud/v1/volumes/7', expect.anything());
    });

    it('leaves volumes alone without a cluster ID', async () => {
      mockedAxios.delete.mockResolvedValue({});
      await service.deprovisionServer(42);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe('createHetznerServer', () => {
    const unavailable = { response: { status: 412, data: { error: { code: 'resource_unavailable', message: 'no capacity' } } } };

    it('falls back to an equivalent type when the requested one has no capacity', async () => {
      mockedAxios.get.mockResolvedValue({ data: { ssh_keys: [] } });
      mockedAxios.post.mockRejectedValueOnce(unavailable).mockResolvedValueOnce({ data: { server: { id: 1 } } });

      const server = await (service as any).createHetznerServer('n', 'cx33', 'fsn1');

      expect(server.id).toBe(1);
      expect(mockedAxios.post.mock.calls.map((c) => (c[1] as any).server_type)).toEqual(['cx33', 'cpx32']);
    });

    it("surfaces Hetzner's error code and message when all candidates fail", async () => {
      mockedAxios.get.mockResolvedValue({ data: { ssh_keys: [] } });
      mockedAxios.post.mockRejectedValue(unavailable);
      await expect((service as any).createHetznerServer('n', 'cx33', 'fsn1')).rejects.toThrow(
        /resource_unavailable — no capacity/,
      );
    });
  });

  describe('multi-site bootstrap roles', () => {
    const volume = { id: 7, linuxDevice: '/dev/disk/by-id/scsi-0HC_Volume_7' };
    const labels = { 'eutlas.eu/role': 'data', 'topology.kubernetes.io/zone': 'fsn1' };

    it('starts the K3s server on the private network and still installs the operator', () => {
      const script: string = (service as any).buildBootstrapScript(volume, 'k', {
        kind: 'server', token: 'tok', publicIp: '1.2.3.4', labels,
      });
      expect(script).toContain("K3S_TOKEN='tok'");
      expect(script).toContain('--advertise-address=$PRIV_IP');
      expect(script).toContain('--node-external-ip=1.2.3.4');
      expect(script).toContain('--node-label=topology.kubernetes.io/zone=fsn1');
      expect(script).toContain('mongodb-kubernetes');
      expect(script.trim().split('\n').pop()).toBe('base64 -w 0 /etc/rancher/k3s/k3s.yaml');
      expect(() => execFileSync('bash', ['-n'], { input: script })).not.toThrow();
    });

    it('joins agents without operator or volume and taints the arbiter', () => {
      const script: string = (service as any).buildBootstrapScript(null, null, {
        kind: 'agent', token: 'tok', publicIp: '5.6.7.8', serverPrivateIp: '10.73.0.2',
        labels: { 'eutlas.eu/role': 'arbiter' }, taints: ['eutlas.eu/arbiter=true:NoSchedule'],
      });
      expect(script).toContain("K3S_URL='https://10.73.0.2:6443'");
      expect(script).toContain('--node-taint=eutlas.eu/arbiter=true:NoSchedule');
      expect(script).not.toContain('cryptsetup luksFormat');
      expect(script).not.toContain('helm upgrade');
      expect(() => execFileSync('bash', ['-n'], { input: script })).not.toThrow();
    });
  });

  describe('bootstrap script', () => {
    const volume = { id: 7, linuxDevice: '/dev/disk/by-id/scsi-0HC_Volume_7' };

    it('derives a stable per-volume LUKS key', () => {
      const key = (service as any).dataVolumeKey('c1', 7);
      expect(key).toBe((service as any).dataVolumeKey('c1', 7));
      expect(key).not.toBe((service as any).dataVolumeKey('c1', 8));
      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('sets up the encrypted local-path root before installing K3s', () => {
      const script: string = (service as any).buildBootstrapScript(volume, 'secret-key');

      expect(script).toContain("DATA_DEV='/dev/disk/by-id/scsi-0HC_Volume_7'");
      expect(script).toContain("printf '%s' 'secret-key' > /etc/eutlas/data.key");
      expect(script).toContain('cryptsetup isLuks "$DATA_DEV" || cryptsetup luksFormat');
      expect(script.indexOf('mount /dev/mapper/eutlas-data /var/lib/rancher/k3s/storage')).toBeLessThan(
        script.indexOf('=== Installing K3s ==='),
      );
      // Must parse as valid bash.
      expect(() => execFileSync('bash', ['-n'], { input: script })).not.toThrow();
    });
  });
});
