import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac } from 'crypto';
import { Client as SshClient } from 'ssh2';
import { PLAN_NAMESPACE_STORAGE_QUOTA } from '../kubernetes/kubernetes.service';

// Hetzner server type per EUTLAS plan.
// Every plan (including DEV/SMALL/MEDIUM) runs on its own dedicated Hetzner
// server so a single misbehaving customer cluster cannot impact any other.
//
// Hetzner deprecated the old Intel cx22/cx32/cx31/cx41/cx51 line in 2026-Q1;
// these mappings use the successor Intel (cx23/cx33/cx43/cx53) and AMD
// dedicated (ccx*) families. Prices as of 2026-04 (gross, excl. VAT).
const PLAN_SERVER_TYPES: Record<string, string> = {
  DEV:          'cx23',   // 2 vCPU Intel shared, 4 GB RAM,  40 GB SSD  (~€4.75/mo)
  SMALL:        'cx23',   // 2 vCPU Intel shared, 4 GB RAM,  40 GB SSD  (~€4.75/mo)
  MEDIUM:       'cx33',   // 4 vCPU Intel shared, 8 GB RAM,  80 GB SSD  (~€7.72/mo)
  LARGE:        'cx43',   // 8 vCPU Intel shared, 16 GB RAM, 160 GB SSD (~€14.27/mo)
  XLARGE:       'cx53',   // 16 vCPU Intel shared, 32 GB RAM, 320 GB SSD (~€26.76/mo)
  XXL:          'cpx51',  // 16 vCPU AMD shared,  32 GB RAM, 360 GB NVMe (~€84.48/mo)
  XXXL:         'ccx33',  // 8 vCPU dedicated,    32 GB RAM, 240 GB NVMe (~€74.36/mo)
  DEDICATED_L:  'ccx43',  // 16 vCPU dedicated,   64 GB RAM, 360 GB NVMe (~€148.74/mo)
  DEDICATED_XL: 'ccx53',  // 32 vCPU dedicated,  128 GB RAM, 600 GB NVMe (~€297.49/mo)
};

// Fallback server type for unknown plans — cheapest current-gen Intel.
const DEFAULT_SERVER_TYPE = 'cx23';

// K3s local-path provisioner root; mounted from the encrypted data volume.
const LOCAL_PATH_ROOT = '/var/lib/rancher/k3s/storage';
const MIN_VOLUME_GB = 10;

/** Data volume size: the plan's namespace storage budget (data × replicas, logs, headroom). */
export function dataVolumeSizeGb(plan: string): number {
  const quota = PLAN_NAMESPACE_STORAGE_QUOTA[plan] ?? PLAN_NAMESPACE_STORAGE_QUOTA.DEV;
  const match = /^(\d+)(Gi|Ti)$/.exec(quota);
  if (!match) return MIN_VOLUME_GB;
  const gb = Number(match[1]) * (match[2] === 'Ti' ? 1024 : 1);
  return Math.max(MIN_VOLUME_GB, gb);
}

export interface DedicatedServerInfo {
  serverId: number;
  serverIp: string;
  kubeconfig: string; // raw YAML, already patched with public IP
  volumeId: number;   // LUKS-encrypted Hetzner volume backing local-path storage
}

interface DataVolume {
  id: number;
  linuxDevice: string;
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

  /**
   * Returns true if this plan requires a dedicated Hetzner node.
   * Since 2026-04 every plan runs on its own node — this always returns true,
   * but the method is kept for backward compatibility with existing callers
   * and to make the intent explicit at the call site.
   */
  needsDedicatedServer(_plan: string): boolean {
    return true;
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

    const serverType = PLAN_SERVER_TYPES[plan] ?? DEFAULT_SERVER_TYPE;
    const serverName = `eutlas-cluster-${clusterId}`;

    this.logger.log(`[${clusterId}] Provisioning dedicated server (plan=${plan}, type=${serverType}, region=${region})`);

    // ---- 1. Create server ----
    const server = await this.createHetznerServer(serverName, serverType, region);
    const ip: string = server.public_net.ipv4.ip;
    this.logger.log(`[${clusterId}] Server ${server.id} created at ${ip}`);

    // ---- 2. Wait for server to reach "running" state ----
    await this.waitForServerRunning(server.id);
    this.logger.log(`[${clusterId}] Server ${server.id} is running`);

    // ---- 3. Create + attach the data volume (encrypted on the node in step 5) ----
    const volume = await this.ensureDataVolume(clusterId, server.id, plan);
    this.logger.log(`[${clusterId}] Data volume ${volume.id} attached (${dataVolumeSizeGb(plan)} GB)`);

    // ---- 4. Wait for sshd to become available ----
    await this.waitForSsh(ip);
    this.logger.log(`[${clusterId}] SSH available on ${ip}`);

    // ---- 5. Bootstrap encrypted storage + K3s + MongoDB operator via SSH ----
    const kubeconfig = await this.bootstrapServer(ip, clusterId, volume);
    this.logger.log(`[${clusterId}] Bootstrap complete`);

    return { serverId: server.id, serverIp: ip, kubeconfig, volumeId: volume.id };
  }

  /**
   * Deletes a Hetzner server by its numeric ID. With a cluster ID, its data
   * volume (found by name) is deleted too.
   */
  async deprovisionServer(serverId: number, clusterId?: string): Promise<void> {
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
      if (error.response?.status !== 404) {
        this.logger.error(`Failed to delete server ${serverId}: ${error.message}`);
        throw error;
      }
    }

    if (clusterId) {
      await this.deleteDataVolume(clusterId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private get api() {
    return { headers: { Authorization: `Bearer ${this.hcloudToken}` } };
  }

  /** Creates (or, on a retry, reuses) the cluster's data volume and attaches it to the server. */
  private async ensureDataVolume(clusterId: string, serverId: number, plan: string): Promise<DataVolume> {
    const name = `eutlas-data-${clusterId}`;
    let volume = await this.findVolumeByName(name);

    if (!volume) {
      // Passing `server` creates the volume in the server's location and attaches it.
      const response = await axios.post(
        'https://api.hetzner.cloud/v1/volumes',
        {
          name,
          size: dataVolumeSizeGb(plan),
          server: serverId,
          automount: false,
          labels: { 'managed-by': 'eutlas', type: 'customer-cluster-data', cluster: clusterId },
        },
        this.api,
      );
      volume = response.data.volume;
      const actions = [response.data.action, ...(response.data.next_actions ?? [])].filter(Boolean);
      for (const action of actions) {
        await this.waitForAction(action.id);
      }
    } else if (volume.server !== serverId) {
      if (volume.server) {
        throw new Error(`Volume ${volume.id} (${name}) is attached to another server ${volume.server}`);
      }
      const response = await axios.post(
        `https://api.hetzner.cloud/v1/volumes/${volume.id}/actions/attach`,
        { server: serverId, automount: false },
        this.api,
      );
      await this.waitForAction(response.data.action.id);
    }

    return { id: volume.id, linuxDevice: volume.linux_device };
  }

  private async findVolumeByName(name: string): Promise<any | null> {
    const response = await axios.get('https://api.hetzner.cloud/v1/volumes', { ...this.api, params: { name } });
    return response.data.volumes?.[0] ?? null;
  }

  private async deleteDataVolume(clusterId: string): Promise<void> {
    const volume = await this.findVolumeByName(`eutlas-data-${clusterId}`);
    if (!volume) return;

    // Deleting the server detaches the volume asynchronously; a volume can only
    // be deleted once detached.
    const deadline = Date.now() + 120_000;
    let current = volume;
    while (current.server && Date.now() < deadline) {
      await this.sleep(5_000);
      current = (await axios.get(`https://api.hetzner.cloud/v1/volumes/${volume.id}`, this.api)).data.volume;
    }
    if (current.server) {
      throw new Error(`Volume ${volume.id} is still attached to server ${current.server}; not deleting`);
    }

    await axios.delete(`https://api.hetzner.cloud/v1/volumes/${volume.id}`, this.api);
    this.logger.log(`Data volume ${volume.id} of cluster ${clusterId} deleted`);
  }

  private async waitForAction(actionId: number, maxMs = 180_000): Promise<void> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const { action } = (await axios.get(`https://api.hetzner.cloud/v1/actions/${actionId}`, this.api)).data;
      if (action.status === 'success') return;
      if (action.status === 'error') {
        throw new Error(`Hetzner action ${actionId} (${action.command}) failed: ${action.error?.message}`);
      }
      await this.sleep(2_000);
    }
    throw new Error(`Hetzner action ${actionId} did not finish within ${maxMs / 1000}s`);
  }

  /**
   * LUKS passphrase for a cluster's data volume, derived from the platform
   * master key so a retried bootstrap reproduces it and nothing extra needs
   * storing. The node keeps a copy in /etc/eutlas/data.key to unlock at boot.
   */
  private dataVolumeKey(clusterId: string, volumeId: number): string {
    const master = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');
    if (!master) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured — cannot derive volume encryption key');
    }
    return createHmac('sha256', master).update(`luks:${clusterId}:${volumeId}`).digest('base64url');
  }

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

    try {
      const response = await axios.post('https://api.hetzner.cloud/v1/servers', payload, {
        headers: { Authorization: `Bearer ${this.hcloudToken}` },
      });
      return response.data.server;
    } catch (error: any) {
      if (error.response?.status !== 409) {
        throw error;
      }

      const existing = await axios.get('https://api.hetzner.cloud/v1/servers', {
        headers: { Authorization: `Bearer ${this.hcloudToken}` },
        params: { name },
      });
      const server = existing.data.servers?.[0];
      if (!server) {
        throw error;
      }

      this.logger.warn(`Hetzner server ${name} already exists - reusing server ${server.id}`);
      return server;
    }
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
   *   - LUKS-encrypted data volume mounted as the local-path storage root
   *   - K3s single-node install
   *   - Helm install
   *   - MongoDB Community Operator via Helm
   *   - Returns the kubeconfig with the public IP substituted in
   */
  private bootstrapServer(ip: string, clusterId: string, volume: DataVolume): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.sshPrivateKey) {
        return reject(new Error('HETZNER_CLUSTER_SSH_PRIVATE_KEY is not configured'));
      }

      const conn = new SshClient();

      conn.on('ready', () => {
        this.logger.debug(`[${clusterId}] SSH connected to ${ip}, running bootstrap`);

        const script = this.buildBootstrapScript(volume, this.dataVolumeKey(clusterId, volume.id));

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
  private buildBootstrapScript(volume: DataVolume, volumeKey: string): string {
    // We deliberately emit a single heredoc-free, quote-safe string.
    return [
      'set -e',

      // ── Host hardening ────────────────────────────────────────────────────
      'echo "=== Hardening SSH and host firewall ==="',
      'mkdir -p /etc/ssh/sshd_config.d',
      "cat > /etc/ssh/sshd_config.d/99-eutlas-hardening.conf <<'EOF'",
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'ChallengeResponseAuthentication no',
      'PubkeyAuthentication yes',
      'PermitRootLogin without-password',
      'EOF',
      'sshd -t',
      'systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true',
      'if [ -f /root/.ssh/authorized_keys ]; then awk \'!/h3-persistent/\' /root/.ssh/authorized_keys > /root/.ssh/authorized_keys.tmp && mv /root/.ssh/authorized_keys.tmp /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys; fi',
      'crontab -l 2>/dev/null | awk \'!/\\/var\\/\\.sysupd\\/\\.cache-manager/ && !/systemd-cache\\.service/\' | crontab - 2>/dev/null || true',
      'pkill -KILL -x .cache-manager 2>/dev/null || true',
      'rm -rf /var/.sysupd /etc/systemd/system/systemd-cache.service',
      'systemctl daemon-reload',
      "cat > /usr/local/sbin/eutlas-host-firewall.sh <<'EOF'",
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'ALLOW_API_FROM="${ALLOW_API_FROM:-}"',
      'if [ -n "$ALLOW_API_FROM" ]; then',
      '  iptables -C INPUT -i eth0 -s "$ALLOW_API_FROM" -p tcp --dport 6443 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i eth0 -s "$ALLOW_API_FROM" -p tcp --dport 6443 -j ACCEPT',
      'fi',
      'for port in 2379 2380 10250 10257 10259 10260 5473 9345; do',
      '  iptables -C INPUT -i eth0 -p tcp --dport "$port" -j DROP 2>/dev/null || iptables -I INPUT 1 -i eth0 -p tcp --dport "$port" -j DROP',
      'done',
      'for port in 3333 3334 3335 4444 5555 7777 14444; do',
      '  iptables -C OUTPUT -p tcp --dport "$port" -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -p tcp --dport "$port" -j REJECT',
      'done',
      'if [ -n "$ALLOW_API_FROM" ]; then',
      '  iptables -C INPUT -i eth0 -p tcp --dport 6443 -j DROP 2>/dev/null || iptables -A INPUT -i eth0 -p tcp --dport 6443 -j DROP',
      'fi',
      'EOF',
      'chmod 700 /usr/local/sbin/eutlas-host-firewall.sh',
      "cat > /etc/systemd/system/eutlas-host-firewall.service <<'EOF'",
      '[Unit]',
      'Description=EUTLAS host firewall hardening',
      'After=network-online.target',
      'Wants=network-online.target',
      '',
      '[Service]',
      'Type=oneshot',
      'EnvironmentFile=-/etc/eutlas-host-firewall.env',
      'ExecStart=/usr/local/sbin/eutlas-host-firewall.sh',
      'RemainAfterExit=yes',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      'systemctl daemon-reload',
      'systemctl enable --now eutlas-host-firewall.service',

      // ── Encrypted data volume (backs K3s local-path storage) ──────────────
      // Every step is idempotent so a retried bootstrap reuses the volume.
      'echo "=== Preparing encrypted data volume ==="',
      `DATA_DEV='${volume.linuxDevice}'`,
      'for i in $(seq 1 60); do [ -b "$DATA_DEV" ] && break; sleep 2; done',
      '[ -b "$DATA_DEV" ] || { echo "data volume $DATA_DEV not present" >&2; exit 1; }',
      'command -v cryptsetup >/dev/null 2>&1 || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq cryptsetup; }',
      'install -d -m 700 /etc/eutlas',
      `(umask 077; printf '%s' '${volumeKey}' > /etc/eutlas/data.key)`,
      'cryptsetup isLuks "$DATA_DEV" || cryptsetup luksFormat --batch-mode --type luks2 --key-file /etc/eutlas/data.key "$DATA_DEV"',
      '[ -e /dev/mapper/eutlas-data ] || cryptsetup open --key-file /etc/eutlas/data.key "$DATA_DEV" eutlas-data',
      'blkid /dev/mapper/eutlas-data >/dev/null 2>&1 || mkfs.ext4 -q -L eutlas-data /dev/mapper/eutlas-data',
      `mkdir -p ${LOCAL_PATH_ROOT}`,
      'grep -q "^eutlas-data " /etc/crypttab 2>/dev/null || echo "eutlas-data $DATA_DEV /etc/eutlas/data.key luks,nofail" >> /etc/crypttab',
      `grep -q " ${LOCAL_PATH_ROOT} " /etc/fstab || echo "/dev/mapper/eutlas-data ${LOCAL_PATH_ROOT} ext4 defaults,nofail 0 2" >> /etc/fstab`,
      `mountpoint -q ${LOCAL_PATH_ROOT} || mount /dev/mapper/eutlas-data ${LOCAL_PATH_ROOT}`,

      // ── K3s ──────────────────────────────────────────────────────────────
      'echo "=== Installing K3s ==="',
      'if ! systemctl is-active --quiet k3s; then curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -s -; fi',
      'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml',

      // Wait until K3s API is up
      'echo "=== Waiting for K3s ==="',
      'for i in $(seq 1 30); do kubectl get nodes 2>/dev/null && break; sleep 5; done',
      'kubectl wait --for=condition=ready node --all --timeout=120s',

      // ── Helm ─────────────────────────────────────────────────────────────
      'echo "=== Installing Helm ==="',
      'if ! command -v helm >/dev/null 2>&1; then curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash; fi',

      // ── MongoDB Controllers for Kubernetes ───────────────────────────────
      'echo "=== Installing MongoDB Controllers for Kubernetes ==="',
      'helm repo add mongodb https://mongodb.github.io/helm-charts --force-update',
      'helm repo update',
      'if helm status community-operator -n mongodb-operator >/dev/null 2>&1 && ! helm status mongodb-kubernetes -n mongodb-operator >/dev/null 2>&1; then helm uninstall community-operator -n mongodb-operator || true; fi',
      'helm upgrade --install mongodb-kubernetes mongodb/mongodb-kubernetes \\',
      '  --namespace mongodb-operator \\',
      '  --create-namespace \\',
      '  --set operator.watchedResources="{mongodbcommunity,mongodbsearch}" \\',
      '  --set operator.resources.requests.cpu=100m \\',
      '  --set operator.resources.requests.memory=128Mi \\',
      '  --set operator.resources.limits.cpu=200m \\',
      '  --set operator.resources.limits.memory=256Mi \\',
      '  --wait \\',
      '  --timeout 5m',
      'kubectl set env deployment/mongodb-kubernetes-operator -n mongodb-operator WATCH_NAMESPACE-',
      'cat <<\'EOF\' | kubectl apply -f -',
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRole',
      'metadata:',
      '  name: eutlas-mongodb-kubernetes-crossnamespace',
      'rules:',
      '  - apiGroups: ["mongodbcommunity.mongodb.com"]',
      '    resources: ["mongodbcommunity", "mongodbcommunity/status", "mongodbcommunity/finalizers"]',
      '    verbs: ["*"]',
      '  - apiGroups: ["mongodb.com"]',
      '    resources: ["*"]',
      '    verbs: ["*"]',
      '  - apiGroups: [""]',
      '    resources: ["configmaps", "events", "persistentvolumeclaims", "pods", "secrets", "serviceaccounts", "services"]',
      '    verbs: ["*"]',
      '  - apiGroups: ["apps"]',
      '    resources: ["deployments", "statefulsets"]',
      '    verbs: ["*"]',
      '  - apiGroups: ["batch"]',
      '    resources: ["jobs", "cronjobs"]',
      '    verbs: ["*"]',
      '  - apiGroups: ["policy"]',
      '    resources: ["poddisruptionbudgets"]',
      '    verbs: ["*"]',
      '  - apiGroups: ["rbac.authorization.k8s.io"]',
      '    resources: ["roles", "rolebindings"]',
      '    verbs: ["*"]',
      '---',
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRoleBinding',
      'metadata:',
      '  name: eutlas-mongodb-kubernetes-crossnamespace',
      'roleRef:',
      '  apiGroup: rbac.authorization.k8s.io',
      '  kind: ClusterRole',
      '  name: eutlas-mongodb-kubernetes-crossnamespace',
      'subjects:',
      '  - kind: ServiceAccount',
      '    name: mongodb-kubernetes-operator',
      '    namespace: mongodb-operator',
      'EOF',
      'kubectl rollout status deployment/mongodb-kubernetes-operator -n mongodb-operator --timeout=180s',

      // ── Output kubeconfig as base64 (last line, easy to parse) ────────────
      'echo "=== Bootstrap complete ==="',
      'base64 -w 0 /etc/rancher/k3s/k3s.yaml',
    ].join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
