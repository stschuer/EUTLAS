#!/usr/bin/env bash
# Manual failover for a multi-site cluster when the whole fsn1 location is lost.
#
# Topology: data member in fsn1 (priority 2), arbiter in fsn1, data member in
# nbg1 (priority 1). Losing fsn1 removes 2 of 3 votes, so nbg1 cannot elect
# itself. This script force-reconfigures the replica set so the nbg1 member is
# the only voting member and becomes primary. The K3s control plane runs on the
# fsn1 data node, so it is unavailable too — we talk to mongod directly.
#
# Data written to fsn1 but not yet replicated to nbg1 is lost (seconds at most).
# After fsn1 is back, re-provision it from nbg1 (do NOT just restart the old
# fsn1 member: it would see a divergent history).
#
# Usage:
#   scripts/multi-site-failover.sh <nbg1-member-host:port> <admin-user> [ca-file]
#   e.g. scripts/multi-site-failover.sh m1.aihub-prod-x7k2ab.db.eutlas.eu:31002 admin eutlas-ca.pem
# The admin password is read from $MONGO_ADMIN_PASSWORD or prompted.
set -euo pipefail

MEMBER="${1:?nbg1 member host:port}"
ADMIN_USER="${2:?admin user}"
CA_FILE="${3:-eutlas-ca.pem}"
[ -f "$CA_FILE" ] || curl -fsS -o "$CA_FILE" https://app.eutlas.eu/api/v1/tls/ca.pem
if [ -z "${MONGO_ADMIN_PASSWORD:-}" ]; then
  read -r -s -p "Password for $ADMIN_USER: " MONGO_ADMIN_PASSWORD; echo
fi
export MONGO_ADMIN_PASSWORD

URI="mongodb://${MEMBER}/?directConnection=true&tls=true&authSource=admin"

echo "Current replica set view from $MEMBER:"
mongosh "$URI" --tlsCAFile "$CA_FILE" -u "$ADMIN_USER" -p "$MONGO_ADMIN_PASSWORD" --quiet --eval '
  const s = rs.status();
  s.members.forEach(m => print(`  ${m.name}  ${m.stateStr}  health=${m.health}`));
'

read -r -p "Force $MEMBER to be the only voting member and primary? Type FAILOVER to continue: " answer
[ "$answer" = "FAILOVER" ] || { echo "Aborted."; exit 1; }

mongosh "$URI" --tlsCAFile "$CA_FILE" -u "$ADMIN_USER" -p "$MONGO_ADMIN_PASSWORD" --quiet --eval '
  const self = db.adminCommand({ hello: 1 }).me;
  const cfg = rs.conf();
  const keep = cfg.members.filter(m => m.host === self);
  if (keep.length !== 1) throw new Error(`member ${self} not found in config`);
  keep[0].votes = 1;
  keep[0].priority = 1;
  cfg.members = keep;
  cfg.version += 1;
  printjson(rs.reconfig(cfg, { force: true }));
'

echo "Waiting for $MEMBER to become primary…"
for i in $(seq 1 30); do
  state=$(mongosh "$URI" --tlsCAFile "$CA_FILE" -u "$ADMIN_USER" -p "$MONGO_ADMIN_PASSWORD" --quiet --eval 'db.adminCommand({ hello: 1 }).isWritablePrimary')
  [ "$state" = "true" ] && { echo "$MEMBER is primary. Clients using mongodb+srv reconnect automatically."; exit 0; }
  sleep 2
done
echo "Member did not become primary — check rs.status()." >&2
exit 1
