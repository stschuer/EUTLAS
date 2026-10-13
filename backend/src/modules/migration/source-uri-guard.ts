import { BadRequestException } from '@nestjs/common';
import { promises as dns } from 'dns';
import { isIP } from 'net';

/** Hostnames of a mongodb:// or mongodb+srv:// URI (credentials, ports and options stripped). */
export function sourceUriHosts(uri: string): { srv: boolean; hosts: string[] } {
  const match = /^(mongodb(?:\+srv)?):\/\/(.+)$/i.exec(uri.trim());
  if (!match) throw new BadRequestException('Source URI must start with mongodb:// or mongodb+srv://');
  const srv = match[1].toLowerCase() === 'mongodb+srv';
  let rest = match[2];
  const end = rest.search(/[/?]/);
  if (end >= 0) rest = rest.slice(0, end);
  rest = rest.slice(rest.lastIndexOf('@') + 1);
  const hosts = rest
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('[') ? h.slice(1, h.indexOf(']')) : h.replace(/:\d+$/, '')).toLowerCase());
  if (hosts.length === 0) throw new BadRequestException('Source URI has no host');
  return { srv, hosts };
}

const INTERNAL_HOSTNAME = /(^localhost$|\.local$|\.localdomain$|\.internal$|\.svc$|\.cluster\.local$|^[^.]+$)/;

/** True for loopback, private, link-local, CGNAT, unspecified and ULA addresses. */
export function isInternalAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('::ffff:')) return isInternalAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Migrations connect from inside the platform, so a customer-supplied source
 * URI must not point at internal services (platform MongoDB, Kubernetes API,
 * metadata endpoints, other tenants' in-cluster services).
 */
export async function assertPublicSourceUri(uri: string): Promise<void> {
  const { srv, hosts } = sourceUriHosts(uri);
  const targets = new Set<string>();
  for (const host of hosts) {
    if (srv) {
      const records = await dns.resolveSrv(`_mongodb._tcp.${host}`).catch((): { name: string }[] => []);
      if (records.length === 0) throw new BadRequestException(`No SRV records for ${host}`);
      records.forEach((r) => targets.add(r.name.toLowerCase()));
    } else {
      targets.add(host);
    }
  }

  for (const target of targets) {
    if (!isIP(target) && INTERNAL_HOSTNAME.test(target)) {
      throw new BadRequestException(`Source host ${target} is not a public address`);
    }
    const addresses = isIP(target)
      ? [target]
      : (await dns.lookup(target, { all: true }).catch(() => [])).map((a) => a.address);
    if (addresses.length === 0) throw new BadRequestException(`Source host ${target} does not resolve`);
    if (addresses.some(isInternalAddress)) {
      throw new BadRequestException(`Source host ${target} resolves to a non-public address`);
    }
  }
}
