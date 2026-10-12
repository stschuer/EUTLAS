import axios from 'axios';
import { execFileSync } from 'child_process';
import { HetznerProvisionerService, dataVolumeSizeGb } from './hetzner-provisioner.service';

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
