# Platform MongoDB HA Migration Runbook

This runbook prepares the production platform database migration from the current
single-node `mongodb` Deployment to a TLS-enabled 3-member MongoDB Community
ReplicaSet named `platform-mongodb-ha`.

The prepared manifests are intentionally not referenced by the normal production
overlay. Do not switch production until every preflight item passes.

## Current blocker

Production currently has one Kubernetes node and `local-path` storage. A
3-member MongoDB ReplicaSet on that footprint is not real HA. Before cutover,
production must have:

- At least 3 Ready Kubernetes worker/control-plane nodes.
- A durable multi-node-capable StorageClass, expected here as `hcloud-volumes-fast`.
- `cert-manager` installed and healthy.
- MongoDB Community Operator installed and healthy.
- Fresh off-site platform backup and at least one successful restore drill.

## Prepared artifacts

- `infrastructure/k8s/platform-mongodb-ha/`: standalone HA MongoDB, TLS certs,
  PDB, network policy, and restore job template.
- `infrastructure/k8s/environments/production-ha/`: production overlay for the
  cutover phase. It adds the HA resources, mounts the MongoDB CA into the
  backend, and switches the platform backup CronJob to the HA TLS endpoint.
- `.github/workflows/production-ha-preflight.yml`: manual preflight workflow.

## Phase 1: Infrastructure

Provision two additional production nodes before continuing. Ideally each node
should be in a different failure domain. Then install the Hetzner CSI driver and
storage classes if they are not already present:

```bash
kubectl apply -f https://raw.githubusercontent.com/hetznercloud/csi-driver/main/deploy/kubernetes/hcloud-csi.yml
kubectl apply -f infrastructure/k8s/storage/hetzner-storage-class.yaml
kubectl get nodes -o wide
kubectl get storageclass hcloud-volumes-fast
```

Run the manual GitHub workflow `Production HA Preflight`. It must fail until the
real prerequisites are present; that is expected on the current one-node setup.

## Phase 2: Operator and Shadow ReplicaSet

Production already has a Helm-managed MongoDB Community Operator Deployment,
but it may be scaled to zero. Prefer repairing that existing Deployment instead
of applying the legacy repo operator manifest, because the Deployment selector is
immutable.

```bash
kubectl -n mongodb-operator scale deployment/mongodb-kubernetes-operator --replicas=1
kubectl rollout status deployment/mongodb-kubernetes-operator -n mongodb-operator --timeout=5m
```

If the Deployment does not exist, install the official MongoDB Community
Operator with Helm and rerun the preflight before continuing.

Create the shadow HA database without touching the current `mongodb` service:

```bash
kubectl apply -k infrastructure/k8s/platform-mongodb-ha
kubectl wait --for=condition=Ready mongodbcommunity/platform-mongodb-ha -n eutlas --timeout=30m
kubectl -n eutlas get pods -l app=platform-mongodb-ha -o wide
```

The three MongoDB pods must be spread across different nodes.

## Phase 3: Final Backup and Restore

Use a maintenance window. To avoid data loss, freeze backend writes while taking
the final backup and restoring it into `platform-mongodb-ha`.

```bash
kubectl -n eutlas scale deployment/eutlas-backend --replicas=0
kubectl -n eutlas rollout status deployment/eutlas-backend --timeout=5m

BACKUP_JOB="platform-mongodb-backup-cutover-$(date +%Y%m%d%H%M%S)"
kubectl -n eutlas create job --from=cronjob/platform-mongodb-backup "$BACKUP_JOB"
kubectl -n eutlas wait --for=condition=complete "job/$BACKUP_JOB" --timeout=20m
kubectl -n eutlas logs "job/$BACKUP_JOB" --all-containers=true --tail=200

kubectl -n eutlas delete job platform-mongodb-ha-restore-latest --ignore-not-found
kubectl apply -f infrastructure/k8s/platform-mongodb-ha/restore-latest-platform-backup-job.yaml
kubectl -n eutlas wait --for=condition=complete job/platform-mongodb-ha-restore-latest --timeout=30m
kubectl -n eutlas logs job/platform-mongodb-ha-restore-latest --all-containers=true --tail=240
```

The restore log must show non-zero `users` and `clusters` counts and zero restore
failures.

## Phase 4: Cutover

Build a TLS connection string using the existing production password. The
password must be URL-encoded before being placed into `MONGODB_URI`.

```bash
MONGO_PASSWORD="$(kubectl -n eutlas get secret eutlas-mongodb-credentials -o jsonpath='{.data.password}' | base64 -d)"
ENCODED_PASSWORD="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$MONGO_PASSWORD")"

MONGODB_URI="mongodb://eutlas-admin:${ENCODED_PASSWORD}@platform-mongodb-ha-0.platform-mongodb-ha-svc.eutlas.svc.cluster.local:27017,platform-mongodb-ha-1.platform-mongodb-ha-svc.eutlas.svc.cluster.local:27017,platform-mongodb-ha-2.platform-mongodb-ha-svc.eutlas.svc.cluster.local:27017/eutlas?replicaSet=platform-mongodb-ha&authSource=admin&tls=true&tlsCAFile=/etc/eutlas/mongodb/ca.crt"

kubectl -n eutlas patch secret eutlas-secrets --type='json' \
  -p="[{\"op\":\"replace\",\"path\":\"/data/MONGODB_URI\",\"value\":\"$(printf '%s' "$MONGODB_URI" | base64)\"}]"

kubectl apply -k infrastructure/k8s/environments/production-ha
kubectl -n eutlas scale deployment/eutlas-backend --replicas=1
kubectl -n eutlas rollout status deployment/eutlas-backend --timeout=5m
```

## Phase 5: Validation

```bash
kubectl -n eutlas get pods -o wide
kubectl -n eutlas logs deployment/eutlas-backend --tail=200
kubectl -n eutlas exec deployment/eutlas-backend -- wget -qO- http://127.0.0.1:4000/api/v1/health/ready

BACKUP_JOB="platform-mongodb-backup-ha-verify-$(date +%Y%m%d%H%M%S)"
kubectl -n eutlas create job --from=cronjob/platform-mongodb-backup "$BACKUP_JOB"
kubectl -n eutlas wait --for=condition=complete "job/$BACKUP_JOB" --timeout=20m
kubectl -n eutlas logs "job/$BACKUP_JOB" --all-containers=true --tail=160
```

After a successful HA backup, run the existing restore drill again to prove the
new backup remains recoverable.

## Rollback

Rollback is safe as long as the old `mongodb` Deployment and PVC are not deleted.

```bash
OLD_URI="mongodb://eutlas-admin:${ENCODED_PASSWORD}@mongodb:27017/eutlas?authSource=admin"

kubectl -n eutlas patch secret eutlas-secrets --type='json' \
  -p="[{\"op\":\"replace\",\"path\":\"/data/MONGODB_URI\",\"value\":\"$(printf '%s' "$OLD_URI" | base64)\"}]"

kubectl apply -k infrastructure/k8s/environments/production
kubectl -n eutlas rollout restart deployment/eutlas-backend
kubectl -n eutlas rollout status deployment/eutlas-backend --timeout=5m
```

Do not delete `platform-mongodb-ha` during incident response. Keep both database
systems until the source of the failure is understood.

## Decommission old platform DB

Only after at least seven days of stable HA operation, successful backups, and
successful restore drills:

```bash
kubectl -n eutlas scale deployment/mongodb --replicas=0
kubectl -n eutlas get pvc mongodb-data-pvc
```

Keep `mongodb-data-pvc` until there is a separate, explicitly approved cleanup
task.
