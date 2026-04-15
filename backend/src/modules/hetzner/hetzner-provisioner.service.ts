import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Client as SshClient } from 'ssh2';

// Hetzner server type per EUTLAS plan
const PLAN_SERVER_TYPES: Record<string, string> = {
  LARGE:        'cx31',   // 2 vCPU, 8 GB RAM, 80 GB SSD  (~€14/mo)
  XLARGE:       'cx41',   // 4 vCPU, 16 GB RAM, 160 GB SSD (~€30/mo)
  XXL:          'cx51',   // 8 vCPU, 32 GB RAM, 240 GB SSD (~€60/mo)
  XXXL:         'ccx33',  // 8 vCPU, 32 GB RAM dedicated   (~€80/mo)
  DEDICATED_L:  'ccx43',  // 16 vCPU, 64 GB RAM dedicated
  DEDICATED_XL: 'ccx53',  // 32 vCPU, 128 GB RAM dedicated
};

// Plans that must run on a dedicated Hetzner server
const DEDICATED_PLANS = new Set(['LARGE', 'XLARGE', 'XXL', 'XXXL', 'DEDICATED_L', 'DEDICATED_XL']);

export interface DedicatedServerInfo {
  serverId: number;
  serverIp: string;
  kubeconfig: string; // raw YAML, already patched with public IP
}

@Injectable()
export class HetznerProvisionerService {
  private readonly logger = new Logger(HetznerProvisionerService.name);
  private readonly hcloudToken: string;
  private readonly sshPrivateKey: string;
  private readonly sshKeyName: string;

  constructor(private readonly configService: ConfigService) {
    this.hcloudToken  = this.configService.get<string>('HCLOUD_TOKEN', '');
    this.sshPrivateKey = this.configService.get<string>('HETZNER_CLUSTER_SSH_PRIVATE_KEY', '');
    this.sshKeyName   = this.configService.get<string>('HETZNER_SSH_KEY_NAME', 'eutlas-cluster-key');
  }

  /** Returns true if this plan requires a dedicated Hetzner node. */
  needsDedicatedServer(plan: string): boolean {
    return DEDICATED_PLANS.has(plan);
  }

  /**
   * Creates a fresh Hetzner server, bootstraps K3s + MongoDB Community Operator,
   * and returns the kubeconfig plus server metadata.
   *
   * Expected runtime: 4–8 minutes.
   */
  async provisionClusterServer(clusterId: string, region: string, plan: string): Promise<DedicatedServerInfo> {
    if (!this.hcloudToken) {
      throw new Error('HCLOUD_TOKEN is not configured — cannot provision dedicated server');
    }

    const serverType = PLAN_SERVER_TYPES[plan] ?? 'cx31';
    const serverName = `eutlas-cluster-${clusterId}`;

    this.logger.log(`[${clusterId}] Provisioning dedicated server (plan=${plan}, type=${serverType}, region=${region})`);

    // ---- 1. Create server ----
    const server = await this.createHetznerServer(serverName, serverType, region);
    const ip: string = server.public_net.ipv4.ip;
    this.logger.log(`[${clusterId}] Server ${server.id} created at ${ip}`);

    // ---- 2. Wait for server to reach "running" state ----
    await this.waitForServerRunning(server.id);
    this.logger.log(`[${clusterId}] Server ${server.id} is running`);

    // ---- 3. Wait for sshd to become available ----
    await this.waitForSsh(ip);
    this.logger.log(`[${clusterId}] SSH available on ${ip}`);

    // ---- 4. Bootstrap K3s + MongoDB operator via SSH ----
    const kubeconfig = await this.bootstrapServer(ip, clusterId);
    this.logger.log(`[${clusterId}] Bootstrap complete`);

    return { serverId: server.id, serverIp: ip, kubeconfig };
  }

  /** Deletes a Hetzner server by its numeric ID. */
  async deprovisionServer(serverId: number): Promise<void> {
    if (!this.hcloudToken) {
      this.logger.warn(`HCLOUD_TOKEN not set — skipping deprovisioning of server ${serverId}`);
      return;
    }

    this.logger.log(`Deleting Hetzner server ${serverId}`);
    try {
      await axios.delete(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${this.hcloudToken}` },
      });
      this.logger.log(`Server ${serverId} deleted`);
    } catch (error: any) {
      // 404 = already gone, ignore
      if (error.response?.status === 404) return;
      this.logger.error(`Failed to delete server ${serverId}: ${error.message}`);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async createHetznerServer(name: string, serverType: string, location: string): Promise<any> {
    const sshKeyId = await this.getSshKeyId();

    const payload: Record<string, any> = {
      name,
      server_type: serverType,
      location,
      image: 'ubuntu-22.04',
      labels: { 'managed-by': 'eutlas', type: 'customer-cluster' },
    };
    if (sshKeyId) payload.ssh_keys = [sshKeyId];

    const response = await axios.post('https://api.hetzner.cloud/v1/servers', payload, {
      headers: { Authorization: `Bearer ${this.hcloudToken}` },
    });
    return response.data.server;
  }

  /** Looks up the SSH key on Hetzner by name so we can inject it into new servers. */
  private async getSshKeyId(): Promise<number | null> {
    if (!this.sshKeyName) return null;
    try {
      const response = await axios.get('https://api.hetzner.cloud/v1/ssh_keys', {
        headers: { Authorization: `Bearer ${this.hcloudToken}` },
        params: { name: this.sshKeyName },
      });
      const keys: any[] = response.data.ssh_keys ?? [];
      return keys.length > 0 ? keys[0].id : null;
    } catch {
      return null;
    }
  }

  private async waitForServerRunning(serverId: number, maxMs = 240_000): Promise<void> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const response = await axios.get(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${this.hcloudToken}` },
      });
      if (response.data.server.status === 'running') return;
      await this.sleep(5_000);
    }
    throw new Error(`Server ${serverId} did not reach "running" within ${maxMs / 1000}s`);
  }

  /** Polls TCP port 22 until it accepts connections (up to maxMs ms). */
  private async waitForSsh(ip: string, maxMs = 120_000): Promise<void> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const open = await this.tcpPortOpen(ip, 22);
      if (open) return;
      await this.sleep(5_000);
    }
    throw new Error(`SSH on ${ip}:22 not reachable within ${maxMs / 1000}s`);
  }

  private tcpPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = net.createConnection({ host, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.setTimeout(4_000);
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
  }

  /**
   * SSHs into the fresh server and runs the full bootstrap sequence:
   *   - K3s single-node install
   *   - Helm install
   *   - MongoDB Community Operator via Helm
   *   - Returns the kubeconfig with the public IP substituted in
   */
  private bootstrapServer(ip: string, clusterId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.sshPrivateKey) {
        return reject(new Error('HETZNER_CLUSTER_SSH_PRIVATE_KEY is not configured'));
      }

      const conn = new SshClient();

      conn.on('ready', () => {
        this.logger.debug(`[${clusterId}] SSH connected to ${ip}, running bootstrap`);

        const script = this.buildBootstrapScript();

        conn.exec(script, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
          stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

          stream.on('close', (code: number) => {
            conn.end();

            if (code !== 0) {
              this.logger.error(`[${clusterId}] Bootstrap script exited with code ${code}\nstderr: ${stderr}`);
              return reject(new Error(`Bootstrap failed (exit ${code}): ${stderr.slice(-500)}`));
            }

            // The last line of stdout is the kubeconfig (base64-encoded)
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];

            try {
              const rawKubeconfig = Buffer.from(lastLine, 'base64').toString('utf-8');
              // Patch the kubeconfig to use the real IP instead of 127.0.0.1 / localhost
              const kubeconfig = rawKubeconfig
                .replace(/https:\/\/127\.0\.0\.1:6443/g, `https://${ip}:6443`)
                .replace(/https:\/\/localhost:6443/g, `https://${ip}:6443`);
              resolve(kubeconfig);
            } catch (e) {
              reject(new Error(`Failed to decode kubeconfig: ${e}\nstdout: ${stdout.slice(-300)}`));
            }
          });
        });
      });

      conn.on('error', (err) => reject(err));

      conn.connect({
        host: ip,
        port: 22,
        username: 'root',
        privateKey: this.sshPrivateKey,
        readyTimeout: 30_000,
      });
    });
  }

  /** Returns a shell script that bootstraps K3s + operator and prints the kubeconfig as base64. */
  private buildBootstrapScript(): string {
    // We deliberately emit a single heredoc-free, quote-safe string.
    return [
      'set -e',

      // ── K3s ──────────────────────────────────────────────────────────────
      'echo "=== Installing K3s ==="',
      'curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -s -',
      'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml',

      // Wait until K3s API is up
      'echo "=== Waiting for K3s ==="',
      'for i in $(seq 1 30); do kubectl get nodes 2>/dev/null && break; sleep 5; done',
      'kubectl wait --for=condition=ready node --all --timeout=120s',

      // ── Helm ─────────────────────────────────────────────────────────────
      'echo "=== Installing Helm ==="',
      'curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash',

      // ── MongoDB Community Operator ────────────────────────────────────────
      'echo "=== Installing MongoDB Community Operator ==="',
      'helm repo add mongodb https://mongodb.github.io/helm-charts --force-update',
      'helm repo update',
      'helm upgrade --install community-operator mongodb/community-operator',
      '  --namespace mongodb-operator',
      '  --create-namespace',
      '  --wait',
      '  --timeout 5m',

      // ── Output kubeconfig as base64 (last line, easy to parse) ────────────
      'echo "=== Bootstrap complete ==="',
      'base64 -w 0 /etc/rancher/k3s/k3s.yaml',
    ].join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
