# EUTLAS Production Deployment Guide

This guide walks you through deploying EUTLAS on Hetzner Cloud with Rancher.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Internet                                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Rancher Manager     │
                    │   rancher.eutlas.eu   │
                    │   (Hetzner CPX31)     │
                    └───────────┬───────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
    ┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
    │  Production   │   │    Staging    │   │   Customer    │
    │   Cluster     │   │    Cluster    │   │   Clusters    │
    │   (FSN1)      │   │    (NBG1)     │   │   (Various)   │
    └───────┬───────┘   └───────────────┘   └───────────────┘
            │
    ┌───────▼───────────────────────────────────────┐
    │              EUTLAS Application               │
    │  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
    │  │Frontend │  │ Backend │  │   MongoDB   │   │
    │  │ (Next)  │  │ (Nest)  │  │  (Operator) │   │
    │  └─────────┘  └─────────┘  └─────────────┘   │
    │  ┌─────────┐  ┌─────────┐                    │
    │  │  Redis  │  │ Ingress │                    │
    │  └─────────┘  └─────────┘                    │
    └───────────────────────────────────────────────┘
```

## Prerequisites

- **Hetzner Cloud Account** - [Sign up here](https://console.hetzner.cloud/)
- **Domain name** - e.g., `eutlas.eu`
- **Resend Account** - For email sending
- **GitHub Account** - For CI/CD

### Install Required Tools

```bash
# macOS
brew install hcloud kubectl helm

# Windows (with Scoop)
scoop install hcloud kubectl helm

# Linux
# See individual tool documentation
```

## Step 1: Hetzner API Token

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Select your project (or create one)
3. Go to **Security** → **API Tokens**
4. Create a new token with **Read & Write** permissions
5. Save the token securely

```bash
# Set the token
export HCLOUD_TOKEN="your-token-here"  # Linux/macOS
$env:HCLOUD_TOKEN = "your-token-here"  # Windows PowerShell
```

## Step 2: Deploy Rancher

### Option A: Quick Start (Single Node)

```bash
# Clone the repository
git clone https://github.com/stschuer/EUTLAS.git
cd EUTLAS

# Run deployment script
chmod +x infrastructure/hetzner/deploy.sh
./infrastructure/hetzner/deploy.sh
```

### Option B: Manual Setup

```bash
# Create Rancher server
hcloud server create \
  --name rancher-mgmt \
  --type cpx31 \
  --image ubuntu-22.04 \
  --location fsn1 \
  --ssh-key your-key-name

# Get IP
RANCHER_IP=$(hcloud server ip rancher-mgmt)

# SSH and install
ssh root@$RANCHER_IP

# On the server:
curl -fsSL https://get.docker.com | sh
docker run -d --name rancher --restart=unless-stopped \
  -p 80:80 -p 443:443 \
  --privileged \
  -v /opt/rancher:/var/lib/rancher \
  rancher/rancher:latest
```

### Configure DNS

Point your domain to the Rancher server:

```
rancher.eutlas.eu  →  <RANCHER_IP>
```

### Access Rancher

1. Open `https://rancher.eutlas.eu` (or `https://<RANCHER_IP>`)
2. Get the bootstrap password:
   ```bash
   docker logs rancher 2>&1 | grep "Bootstrap Password"
   ```
3. Log in and set a new admin password
4. Set the Rancher Server URL (e.g., `https://rancher.eutlas.eu`)

## Step 3: Create Kubernetes Clusters

### In Rancher UI:

1. Go to **Cluster Management** → **Create**
2. Select **Hetzner Cloud** (or use **Custom** with node driver)

### Production Cluster

| Setting | Value |
|---------|-------|
| Name | `eutlas-production` |
| Kubernetes Version | v1.28.x |
| Location | FSN1 (Falkenstein) |
| **Node Pools:** | |
| Control Plane | 3x CPX31 (4 vCPU, 8GB RAM) |
| Workers | 3x CPX41 (8 vCPU, 16GB RAM) |

Add label: `env: production`

### Staging Cluster

| Setting | Value |
|---------|-------|
| Name | `eutlas-staging` |
| Kubernetes Version | v1.28.x |
| Location | NBG1 (Nuremberg) |
| **Node Pools:** | |
| Control Plane | 1x CPX21 (3 vCPU, 4GB RAM) |
| Workers | 2x CPX31 (4 vCPU, 8GB RAM) |

Add label: `env: staging`

### Wait for Clusters

Clusters take 5-10 minutes to provision. Wait until status is **Active**.

## Step 4: Download Kubeconfig

1. In Rancher, click on your cluster
2. Click **Download KubeConfig** (top right)
3. Save as `~/.kube/config` or merge with existing

```bash
# Verify connection
kubectl config use-context eutlas-production
kubectl get nodes
```

## Step 5: Install EUTLAS

### Using the Installation Script

```bash
# Linux/macOS
chmod +x infrastructure/hetzner/install-eutlas.sh
./infrastructure/hetzner/install-eutlas.sh production

# Windows PowerShell
.\infrastructure\hetzner\install-eutlas.ps1 -Environment production
```

### Manual Installation

```bash
# Switch to production cluster
kubectl config use-context eutlas-production

# Create namespace
kubectl create namespace eutlas

# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Install NGINX Ingress
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# Install MongoDB Operator
kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml
helm repo add mongodb https://mongodb.github.io/helm-charts
helm install mongodb-operator mongodb/community-operator \
  --namespace mongodb-operator --create-namespace

# Create secrets
kubectl create secret generic eutlas-secrets -n eutlas \
  --from-literal=MONGODB_URI='mongodb://...' \
  --from-literal=JWT_SECRET='your-secret' \
  --from-literal=RESEND_API_KEY='re_...' \
  --from-literal=EMAIL_FROM='noreply@eutlas.eu'

# Apply EUTLAS manifests
kubectl apply -f infrastructure/k8s/fleet/charts/eutlas/templates/
```

## Step 6: Configure DNS

After ingress is installed, get the Load Balancer IP:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

Configure DNS:

```
app.eutlas.eu      →  <LOAD_BALANCER_IP>
staging.eutlas.eu  →  <STAGING_LB_IP>
```

## Step 7: Verify Deployment

```bash
# Check pods
kubectl get pods -n eutlas

# Check ingress
kubectl get ingress -n eutlas

# Check certificates
kubectl get certificate -n eutlas

# View logs
kubectl logs -n eutlas -l app=eutlas -f
```

## Step 8: Set Up GitOps with Fleet

Fleet is built into Rancher for GitOps deployments.

1. In Rancher, go to **Continuous Delivery**
2. Click **Git Repos** → **Add Repository**
3. Configure:
   - **Name**: `eutlas`
   - **Repository URL**: `https://github.com/stschuer/EUTLAS.git`
   - **Branch**: `main`
   - **Paths**: `infrastructure/k8s/fleet/`
4. **Create Cluster Groups**:
   - `production` with label selector `env: production`
   - `staging` with label selector `env: staging`

Now pushes to `main` will automatically deploy to production!

## Step 9: Enable CI/CD

### GitHub Actions Setup

1. Go to your GitHub repo settings
2. **Secrets and Variables** → **Actions**
3. Add these secrets:
   - `HCLOUD_TOKEN` - Hetzner API token

GitHub Actions will automatically:
- Run tests on every PR
- Build Docker images on merge to main
- Push to GitHub Container Registry
- Fleet syncs new images to clusters

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n eutlas
kubectl logs <pod-name> -n eutlas
```

### MongoDB connection issues

```bash
# Check MongoDB pods
kubectl get pods -n eutlas -l app=eutlas-mongodb

# Check MongoDB logs
kubectl logs -n eutlas -l app=eutlas-mongodb
```

### Certificate issues

```bash
# Check certificate status
kubectl describe certificate eutlas-tls -n eutlas

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager
```

### Ingress not working

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

## Scaling

### Scale application

```bash
kubectl scale deployment eutlas-backend -n eutlas --replicas=5
kubectl scale deployment eutlas-frontend -n eutlas --replicas=5
```

### Scale MongoDB

Edit the MongoDBCommunity resource:

```bash
kubectl edit mongodbcommunity eutlas-mongodb -n eutlas
# Change spec.members to desired count
```

## Backups

### MongoDB Backup

```bash
# Create backup job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: mongodb-backup
  namespace: eutlas
spec:
  template:
    spec:
      containers:
      - name: backup
        image: mongo:7.0
        command:
        - mongodump
        - --uri=\$(MONGODB_URI)
        - --out=/backup
        volumeMounts:
        - name: backup
          mountPath: /backup
      volumes:
      - name: backup
        persistentVolumeClaim:
          claimName: mongodb-backup-pvc
      restartPolicy: Never
EOF
```

## Cost Summary

| Component | Production | Staging | Monthly |
|-----------|-----------|---------|---------|
| Rancher (CPX31) | €15 | - | €15 |
| Control Plane (3x/1x CPX31) | €45 | €15 | €60 |
| Workers (3x/2x CPX41/31) | €75 | €30 | €105 |
| Load Balancers | €6 | €6 | €12 |
| Storage (100GB/20GB) | €5 | €2 | €7 |
| **Total** | ~€146 | ~€53 | **~€199** |

## Support

- **Documentation**: This file
- **Issues**: GitHub Issues
- **Rancher Docs**: https://ranchermanager.docs.rancher.com

---

**Your EUTLAS instance is now ready!** 🚀

Users can access it at `https://app.eutlas.eu` to create and manage their MongoDB clusters.




