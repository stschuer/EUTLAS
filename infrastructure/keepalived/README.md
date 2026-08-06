# Highly-available ingress IP via keepalived + Hetzner Floating IP

The workload nodes are dedicated Hetzner servers running RKE2's built-in
ServiceLB (Klipper) — there is **no** Hetzner Cloud controller-manager, so a
`type: LoadBalancer` Service does **not** provision a real load balancer. To get
a single stable entry IP with node failover we use a **Hetzner Floating IP**
whose assignment is moved to the current keepalived MASTER.

> Plain VRRP/ARP failover does **not** work on Hetzner (gratuitous ARP is
> filtered). Failover therefore reassigns the Floating IP through the Hetzner
> API from a keepalived `notify` script.

`ingress-nginx` already runs as a hostPort DaemonSet on all three nodes
(binds :80/:443 on each node IP), so once the Floating IP lands on any node,
traffic reaches the ingress.

## 0. Prerequisites

- A **Hetzner Floating IP** (Cloud console → Floating IPs) of type IPv4,
  assigned initially to `eutlas-prod-node-1`.
- An **hcloud API token** with read/write on Floating IPs, placed on each node
  at `/etc/keepalived/hcloud.token` (mode 0600).
- `keepalived` and `curl` installed on all three nodes:
  `apt-get update && apt-get install -y keepalived curl`

Set these once per session:

```bash
FLOATING_IP=<the.floating.ip>
FLOATING_IP_ID=<hcloud floating-ip id>     # hcloud floating-ip list
```

## 1. Failover script (identical on all nodes)

`/etc/keepalived/assign-floating-ip.sh`:

```bash
#!/usr/bin/env bash
# Reassign the Hetzner Floating IP to THIS server when we become MASTER.
set -eu
TYPE=$1 NAME=$2 STATE=$3
[ "$STATE" = "MASTER" ] || exit 0

TOKEN="$(cat /etc/keepalived/hcloud.token)"
FIP_ID="$(cat /etc/keepalived/floating-ip-id)"
SERVER_ID="$(curl -s -H "Authorization: Bearer ${TOKEN}" \
  'https://api.hetzner.cloud/v1/servers?name='"$(hostname)" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["servers"][0]["id"])')"

curl -s -X POST -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  "https://api.hetzner.cloud/v1/floating_ips/${FIP_ID}/actions/assign" \
  -d '{"server": '"${SERVER_ID}"'}'
```

```bash
chmod 0700 /etc/keepalived/assign-floating-ip.sh
echo "${FLOATING_IP_ID}" > /etc/keepalived/floating-ip-id
```

> If these turn out to be **Robot dedicated** servers (not Cloud), the servers
> have no `api.hetzner.cloud` id; use the Robot failover-IP API instead
> (`https://robot-ws.your-server.de/failover`) with Robot credentials. Confirm
> with `hcloud server list` — if the nodes are absent, they are Robot servers.

## 2. keepalived config

`/etc/keepalived/keepalived.conf` — set `priority` per node
(node-1 = 150, node-2 = 100, node-3 = 50) and a shared `auth_pass`:

```
vrrp_script chk_ingress {
    script "curl -sf -o /dev/null --max-time 2 http://127.0.0.1:80/healthz || pgrep -x nginx"
    interval 2
    weight -40
    fall 2
    rise 2
}

vrrp_instance INGRESS {
    state BACKUP
    interface <PUBLIC_IFACE>        # e.g. eth0 — check with `ip route get 1.1.1.1`
    virtual_router_id 51
    priority <PRIORITY>
    advert_int 1
    nopreempt
    authentication {
        auth_type PASS
        auth_pass <SHARED_SECRET>
    }
    # No virtual_ipaddress block — Hetzner reassigns via the API script below.
    notify /etc/keepalived/assign-floating-ip.sh
    track_script { chk_ingress }
}
```

## 3. Enable

```bash
systemctl enable --now keepalived
systemctl status keepalived
```

Verify the MASTER holds the Floating IP:

```bash
hcloud floating-ip describe ${FLOATING_IP_ID}   # -> assigned to node-1
# from outside:
curl -k -H 'Host: app.eutlas.eu' https://${FLOATING_IP}/api/v1/health   # expect 401 (alive)
```

Test failover: `systemctl stop keepalived` on node-1 → node-2 becomes MASTER and
the Floating IP moves within a few seconds.

## 4. DNS cutover

Point both records at the Floating IP (A record):

```
app.eutlas.eu.  A  <FLOATING_IP>
eutlas.eu.      A  <FLOATING_IP>
```

Then apply the ingress and let cert-manager issue the certificate:

```bash
kubectl apply -f infrastructure/k8s/environments/base/app-ingress.yaml
kubectl get certificate -n eutlas -w    # eutlas-app-tls -> Ready=True within ~1–2 min
```
