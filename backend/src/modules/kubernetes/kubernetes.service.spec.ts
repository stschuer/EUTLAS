import * as k8s from '@kubernetes/client-node';
import { KubernetesService } from './kubernetes.service';

const kubeconfigFor = (server: string) => `
apiVersion: v1
kind: Config
clusters: [{ name: c, cluster: { server: '${server}' } }]
users: [{ name: u, user: { token: t } }]
contexts: [{ name: ctx, context: { cluster: c, user: u } }]
current-context: ctx
`;

describe('KubernetesService cluster routing', () => {
  // Every API client records which cluster (server URL) it was built for.
  const calls: { server: string; method: string; args: any[] }[] = [];
  let service: KubernetesService;

  beforeEach(() => {
    calls.length = 0;
    jest.spyOn(k8s.KubeConfig.prototype, 'makeApiClient').mockImplementation(function (this: k8s.KubeConfig) {
      const server = this.getCurrentCluster()?.server ?? 'shared';
      return new Proxy({}, {
        get: (_t, method: string) => async (...args: any[]) => {
          calls.push({ server, method, args });
          await new Promise((r) => setTimeout(r, 5));
          return { body: {} };
        },
      }) as any;
    });

    const config: Record<string, string> = {
      NODE_ENV: 'production',
      PLATFORM_EGRESS_CIDRS: '46.224.9.177/32, 168.119.50.19/32',
    };
    service = new KubernetesService({ get: (k: string, d?: any) => config[k] ?? d } as any);
    const shared = new k8s.KubeConfig();
    shared.loadFromString(kubeconfigFor('https://shared:6443'));
    const sharedApi = shared.makeApiClient(k8s.CoreV1Api);
    (service as any).defaults = {
      kc: shared,
      coreApi: sharedApi,
      appsApi: sharedApi,
      batchApi: sharedApi,
      networkApi: sharedApi,
      customApi: sharedApi,
      rbacApi: sharedApi,
      dataStorageClass: 'hcloud-volumes-encrypted',
    };
    (service as any).defaultConnected = true;
  });

  afterEach(() => jest.restoreAllMocks());

  it('applies network policy changes on the cluster’s dedicated node', async () => {
    service.setDedicatedKubeconfigResolver(async () => kubeconfigFor('https://node-a:6443'));

    await service.updateNetworkPolicy({ clusterId: 'aaa', projectId: 'p1', allowedCidrs: ['80.152.195.120/32'] });

    const call = calls.find((c) => c.method === 'replaceNamespacedNetworkPolicy')!;
    expect(call.server).toBe('https://node-a:6443');
    const policy = call.args[2];
    expect(policy.spec.podSelector).toEqual({
      matchExpressions: [{ key: 'app', operator: 'In', values: ['mongo-aaa', 'mongo-aaa-svc'] }],
    });
    const cidrs = policy.spec.ingress.flatMap((r: any) => (r.from || []).map((f: any) => f.ipBlock?.cidr)).filter(Boolean);
    expect(cidrs).toEqual(['46.224.9.177/32', '168.119.50.19/32', '80.152.195.120/32']);
  });

  it('keeps operations for different clusters on their own nodes when they run concurrently', async () => {
    service.setDedicatedKubeconfigResolver(async (id) => kubeconfigFor(`https://node-${id}:6443`));

    await Promise.all([
      service.updateNetworkPolicy({ clusterId: 'a', projectId: 'p', allowedCidrs: [] }),
      service.updateNetworkPolicy({ clusterId: 'b', projectId: 'p', allowedCidrs: [] }),
      service.updateNetworkPolicy({ clusterId: 'c', projectId: 'p', allowedCidrs: [] }),
    ]);

    const byServer = Object.fromEntries(
      calls.filter((c) => c.method === 'replaceNamespacedNetworkPolicy').map((c) => [c.server, c.args[0]]),
    );
    expect(byServer).toEqual({
      'https://node-a:6443': 'mongo-a-network-policy',
      'https://node-b:6443': 'mongo-b-network-policy',
      'https://node-c:6443': 'mongo-c-network-policy',
    });
  });

  it('uses the shared cluster for clusters without a dedicated node', async () => {
    service.setDedicatedKubeconfigResolver(async () => undefined);

    await service.updateNetworkPolicy({ clusterId: 'x', projectId: 'p', allowedCidrs: [] });

    expect(calls.find((c) => c.method === 'replaceNamespacedNetworkPolicy')!.server).toBe('https://shared:6443');
  });
});
