# EUTLAS Rancher Setup

This guide covers deploying EUTLAS using Rancher on Hetzner Cloud.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Rancher Management                          │
│                   (rancher.eutlas.eu)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐
│   Production K8s    │  │    Staging K8s      │
│   (Hetzner FSN1)    │  │   (Hetzner NBG1)    │
│                     │  │                     │
│  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │ EUTLAS App    │  │  │  │ EUTLAS App    │  │
│  │ - Backend     │  │  │  │ - Backend     │  │
│  │ - Frontend    │  │  │  │ - Frontend    │  │
│  │ - MongoDB     │  │  │  │ - MongoDB     │  │
│  │ - Redis       │  │  │  │ - Redis       │  │
│  └───────────────┘  │  │  └───────────────┘  │
└─────────────────────┘  └─────────────────────┘
```

## Prerequisites

1. **Hetzner Cloud Account** with API Token
2. **Domain** pointed to Hetzner (e.g., eutlas.eu)
3. **GitHub Account** for GitOps

## Step 1: Deploy Rancher Management Cluster

### Option A: Single-Node Rancher (Quick Start)

```bash
# Create Hetzner server for Rancher (CPX31 recommended)
hcloud server create \
  --name rancher-mgmt \
  --type cpx31 \
  --image ubuntu-22.04 \
  --location fsn1 \
  --ssh-key your-ssh-key

# SSH into server
ssh root@<rancher-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Rancher
docker run -d --restart=unless-stopped \
  -p 80:80 -p 443:443 \
  --privileged \
  -v /opt/rancher:/var/lib/rancher \
  rancher/rancher:latest
```

### Option B: HA Rancher with RKE2 (Production)

```bash
# Create 3 control plane nodes
for i in 1 2 3; do
  hcloud server create \
    --name rancher-cp-$i \
    --type cpx31 \
    --image ubuntu-22.04 \
    --location fsn1 \
    --ssh-key your-ssh-key
done

# Install RKE2 on first node
curl -sfL https://get.rke2.io | sh -
systemctl enable rke2-server.service
systemctl start rke2-server.service

# Get join token
cat /var/lib/rancher/rke2/server/node-token

# Join other nodes with the token
# Then install Rancher via Helm
```

## Step 2: Create Downstream Clusters

### Production Cluster (FSN1 - Falkenstein)

In Rancher UI:
1. **Cluster Management** → **Create**
2. Select **Hetzner Cloud**
3. Configure:
   - Name: `eutlas-production`
   - Location: `fsn1`
   - Node Pools:
     - Control Plane: 3x CPX31 (HA)
     - Workers: 3x CPX41 (for MongoDB)
   - Kubernetes Version: 1.28+

### Staging Cluster (NBG1 - Nuremberg)

1. **Cluster Management** → **Create**
2. Select **Hetzner Cloud**
3. Configure:
   - Name: `eutlas-staging`
   - Location: `nbg1`
   - Node Pools:
     - Control Plane: 1x CPX21
     - Workers: 2x CPX31

## Step 3: Install Required Components

### On Each Cluster:

```bash
# 1. MongoDB Community Operator
kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml
kubectl apply -k infrastructure/k8s/mongodb-operator/

# 2. Cert-Manager (for TLS)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# 3. Ingress Controller (nginx)
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace

# 4. Hetzner CSI Driver (for persistent volumes)
kubectl apply -f infrastructure/k8s/storage/hetzner-storage-class.yaml
```

## Step 4: Configure Fleet for GitOps

Fleet is built into Rancher and handles GitOps deployments.

1. **Continuous Delivery** → **Git Repos**
2. **Add Repository**:
   - Name: `eutlas`
   - Repository URL: `https://github.com/stschuer/EUTLAS.git`
   - Branch: `main` (production) or `develop` (staging)
   - Paths: `infrastructure/k8s/fleet/`

3. **Create Cluster Groups**:
   - `production`: eutlas-production cluster
   - `staging`: eutlas-staging cluster

## Step 5: Secrets Management

### Using Rancher Secrets

```bash
# Create namespace
kubectl create namespace eutlas

# Create secrets
kubectl create secret generic eutlas-secrets -n eutlas \
  --from-literal=MONGODB_URI='mongodb://...' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=RESEND_API_KEY='...'
```

### Using External Secrets Operator (Recommended)

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: eutlas-secrets
  namespace: eutlas
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: eutlas-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: eutlas/production
        property: jwt_secret
```

## Monitoring

Rancher includes built-in monitoring via Prometheus/Grafana:

1. **Cluster** → **Cluster Tools** → **Monitoring**
2. **Install** with default settings
3. Access Grafana via Rancher proxy

## Backup Strategy

1. **Velero** for cluster backup
2. **MongoDB backups** via EUTLAS backup feature
3. **Rancher backup** operator for management cluster

## Cost Estimate (Monthly)

| Resource | Production | Staging | Total |
|----------|-----------|---------|-------|
| Rancher Mgmt (CPX31) | €15 | - | €15 |
| Control Plane (3x CPX31) | €45 | €15 | €60 |
| Workers (3x CPX41) | €75 | €30 | €105 |
| Load Balancer | €6 | €6 | €12 |
| Storage (100GB) | €5 | €3 | €8 |
| **Total** | **€146** | **€54** | **€200** |

## Next Steps

1. Set up GitHub Actions for CI/CD
2. Configure DNS for production domain
3. Set up SSL certificates with Let's Encrypt
4. Configure backup schedules


