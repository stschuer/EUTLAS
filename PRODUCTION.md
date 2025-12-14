# EUTLAS Production Deployment Guide

## Overview

EUTLAS is an EU-based MongoDB Atlas clone running on Hetzner Cloud with Kubernetes.

## Prerequisites

### Infrastructure
- Hetzner Cloud account with API token
- Kubernetes cluster (k3s or managed Hetzner Kubernetes)
- Domain name with DNS configured
- SSL certificates (Let's Encrypt via cert-manager)

### Tools
- kubectl configured
- Helm 3.x
- Terraform (optional, for infrastructure as code)
- Docker

## Step 1: Install MongoDB Community Operator

```bash
# Apply the MongoDB Community Operator
kubectl apply -k infrastructure/k8s/mongodb-operator/

# Or use Helm (recommended)
helm repo add mongodb https://mongodb.github.io/helm-charts
helm install community-operator mongodb/community-operator \
  --namespace mongodb-operator \
  --create-namespace
```

## Step 2: Configure Storage

```bash
# Install Hetzner CSI Driver
kubectl apply -f https://raw.githubusercontent.com/hetznercloud/csi-driver/main/deploy/kubernetes/hcloud-csi.yml

# Apply storage classes
kubectl apply -f infrastructure/k8s/storage/hetzner-storage-class.yaml
```

## Step 3: Create EUTLAS Namespace and RBAC

```bash
kubectl apply -f infrastructure/k8s/base/eutlas-namespace.yaml
```

## Step 4: Configure Environment Variables

Create a `.env.production` file:

```env
# Server
NODE_ENV=production
PORT=4000
API_PREFIX=api/v1

# Database (Your platform's MongoDB, not customer DBs)
MONGODB_URI=mongodb://eutlas-platform-db:27017/eutlas

# Security
JWT_SECRET=<generate-strong-secret-256-bits>
JWT_EXPIRES_IN=7d

# Email
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@eutlas.eu
EMAIL_FROM_NAME=EUTLAS

# Frontend URL (for CORS and email links)
FRONTEND_URL=https://app.eutlas.eu

# Kubernetes
K8S_IN_CLUSTER=true
K8S_NAMESPACE_PREFIX=eutlas-

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

## Step 5: Deploy Backend

```bash
# Build and push Docker image
docker build -t registry.eutlas.eu/eutlas-backend:latest ./backend
docker push registry.eutlas.eu/eutlas-backend:latest

# Deploy to Kubernetes
kubectl apply -f infrastructure/k8s/overlays/production/backend.yaml
```

## Step 6: Deploy Frontend

```bash
# Build and push Docker image
docker build -t registry.eutlas.eu/eutlas-frontend:latest ./frontend
docker push registry.eutlas.eu/eutlas-frontend:latest

# Deploy to Kubernetes
kubectl apply -f infrastructure/k8s/overlays/production/frontend.yaml
```

## Step 7: Configure Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eutlas-ingress
  namespace: eutlas-system
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.eutlas.eu
        - api.eutlas.eu
      secretName: eutlas-tls
  rules:
    - host: app.eutlas.eu
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: eutlas-frontend
                port:
                  number: 3000
    - host: api.eutlas.eu
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: eutlas-backend
                port:
                  number: 4000
```

## Security Checklist

### Application Security
- [x] Rate limiting on all endpoints
- [x] Aggressive throttling on auth endpoints (5 login attempts/min)
- [x] Helmet security headers
- [x] CORS configured for production domain only
- [x] JWT tokens with secure secret
- [x] Password hashing with bcrypt (12 rounds)
- [x] Input validation with class-validator
- [x] SQL injection protection (NoSQL)
- [x] XSS protection via sanitization

### Infrastructure Security
- [ ] Network policies for pod-to-pod communication
- [ ] Pod Security Standards (PSS) enabled
- [ ] Secrets stored in Kubernetes Secrets (or external vault)
- [ ] TLS everywhere (ingress, internal services)
- [ ] Regular security updates

### Monitoring
- [ ] Prometheus + Grafana for metrics
- [ ] Loki for log aggregation
- [ ] Alertmanager for alerts
- [ ] Uptime monitoring (UptimeRobot, Pingdom)

## Backup Strategy

### Platform Database
- Daily automated backups of EUTLAS platform MongoDB
- Store in Hetzner Object Storage
- 30-day retention

### Customer Databases
- Managed via EUTLAS backup system
- Configurable retention policies
- Cross-region backup support (fsn1 <-> nbg1)

## Scaling

### Horizontal Pod Autoscaling
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: eutlas-backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: eutlas-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Troubleshooting

### Check MongoDB Operator Status
```bash
kubectl get mongodbcommunity -A
kubectl describe mongodbcommunity <name> -n <namespace>
```

### Check Cluster Logs
```bash
kubectl logs -f deployment/eutlas-backend -n eutlas-system
```

### Check MongoDB Pod Status
```bash
kubectl get pods -n eutlas-<project-id>
kubectl logs <mongo-pod-name> -n eutlas-<project-id>
```

## Support

For production issues:
- Email: support@eutlas.eu
- Status page: status.eutlas.eu




