import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const API = 'https://api.hetzner.cloud/v1';

/**
 * Records in the platform DNS zone (Hetzner Cloud DNS, default eutlas.eu) for
 * customer database endpoints under *.db.<zone>: per-member A records, the
 * mongodb+srv SRV/TXT records and ACME DNS-01 challenges.
 */
@Injectable()
export class HetznerDnsService {
  private readonly logger = new Logger(HetznerDnsService.name);
  private readonly token: string;
  readonly zone: string;
  /** Parent of all cluster names, e.g. "db" → <cluster>.db.eutlas.eu */
  readonly dbLabel: string;

  constructor(configService: ConfigService) {
    this.token = configService.get<string>('HCLOUD_TOKEN', '');
    this.zone = configService.get<string>('DB_DNS_ZONE', 'eutlas.eu');
    this.dbLabel = configService.get<string>('DB_DNS_LABEL', 'db');
  }

  get enabled(): boolean {
    return !!this.token;
  }

  /** Fully qualified name for a record name relative to the zone. */
  fqdn(name: string): string {
    return `${name}.${this.zone}`;
  }

  /** Record name (relative to the zone) of a cluster's DNS label, e.g. "aihub-prod-x7k2ab.db". */
  clusterName(clusterLabel: string): string {
    return `${clusterLabel}.${this.dbLabel}`;
  }

  /** Create or replace all records of name/type. Empty `values` deletes the set. */
  async setRecords(name: string, type: 'A' | 'TXT' | 'SRV' | 'CNAME', values: string[], ttl = 60): Promise<void> {
    if (!this.enabled) throw new Error('HCLOUD_TOKEN is not configured — cannot manage DNS');
    if (values.length === 0) return this.deleteRecords(name, type);

    const records = values.map((value) => ({ value }));
    try {
      const res = await axios.post(
        `${API}/zones/${this.zone}/rrsets/${encodeURIComponent(name)}/${type}/actions/set_records`,
        { records },
        this.auth,
      );
      await this.waitForAction(res.data.action?.id);
    } catch (error: any) {
      if (error.response?.status !== 404) throw this.describe(error, `set ${type} ${name}`);
      const res = await axios.post(`${API}/zones/${this.zone}/rrsets`, { name, type, ttl, records }, this.auth)
        .catch((e) => { throw this.describe(e, `create ${type} ${name}`); });
      await this.waitForAction(res.data.action?.id);
    }
    this.logger.log(`DNS ${type} ${this.fqdn(name)} → ${values.join(', ')}`);
  }

  async deleteRecords(name: string, type: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const res = await axios.delete(`${API}/zones/${this.zone}/rrsets/${encodeURIComponent(name)}/${type}`, this.auth);
      await this.waitForAction(res.data?.action?.id);
    } catch (error: any) {
      if (error.response?.status !== 404) throw this.describe(error, `delete ${type} ${name}`);
    }
  }

  private get auth() {
    return { headers: { Authorization: `Bearer ${this.token}` } };
  }

  private async waitForAction(actionId?: number, maxMs = 60_000): Promise<void> {
    if (!actionId) return;
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const { action } = (await axios.get(`${API}/actions/${actionId}`, this.auth)).data;
      if (action.status === 'success') return;
      if (action.status === 'error') throw new Error(`DNS action ${actionId} failed: ${action.error?.message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`DNS action ${actionId} did not finish within ${maxMs / 1000}s`);
  }

  private describe(error: any, what: string): Error {
    const detail = error.response?.data?.error?.message ?? error.message;
    return new Error(`Hetzner DNS ${what} failed: ${detail}`);
  }
}
