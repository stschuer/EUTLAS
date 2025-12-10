#!/bin/bash
#
# EUTLAS Quick Start - Complete One-Command Deployment
#
# This script deploys the entire EUTLAS stack:
# 1. Rancher management cluster
# 2. Production Kubernetes cluster
# 3. EUTLAS application with MongoDB
#
# Usage:
#   export HCLOUD_TOKEN="your-hetzner-api-token"
#   export DOMAIN="eutlas.eu"
#   export RESEND_API_KEY="re_..."
#   ./quick-start.sh
#

set -e

# Configuration
DOMAIN=${DOMAIN:-"eutlas.eu"}
LOCATION=${LOCATION:-"fsn1"}
CLUSTER_NAME="eutlas-production"
NAMESPACE="eutlas"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"; }

# Validate prerequisites
validate() {
    header "Validating Prerequisites"
    
    [ -z "$HCLOUD_TOKEN" ] && error "HCLOUD_TOKEN is required"
    [ -z "$RESEND_API_KEY" ] && error "RESEND_API_KEY is required"
    
    for cmd in hcloud kubectl helm curl; do
        command -v $cmd &>/dev/null || error "$cmd is not installed"
        log "Found: $cmd"
    done
    
    success "All prerequisites validated"
}

# Create SSH key
setup_ssh() {
    header "Setting Up SSH Key"
    
    if ! hcloud ssh-key describe eutlas-key &>/dev/null; then
        [ ! -f ~/.ssh/eutlas_ed25519 ] && ssh-keygen -t ed25519 -f ~/.ssh/eutlas_ed25519 -N "" -C "eutlas"
        hcloud ssh-key create --name eutlas-key --public-key-from-file ~/.ssh/eutlas_ed25519.pub
        success "SSH key created"
    else
        log "SSH key already exists"
    fi
}

# Create K3s cluster (simpler than RKE2 for quick start)
create_cluster() {
    header "Creating Kubernetes Cluster"
    
    if hcloud server describe eutlas-master &>/dev/null; then
        log "Cluster already exists"
        MASTER_IP=$(hcloud server ip eutlas-master)
    else
        # Create master node
        log "Creating master node..."
        hcloud server create \
            --name eutlas-master \
            --type cpx31 \
            --image ubuntu-22.04 \
            --location $LOCATION \
            --ssh-key eutlas-key \
            --label cluster=eutlas
        
        MASTER_IP=$(hcloud server ip eutlas-master)
        log "Master IP: $MASTER_IP"
        
        # Wait for server
        sleep 30
        
        # Install K3s
        log "Installing K3s..."
        ssh -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$MASTER_IP << 'INSTALL'
            curl -sfL https://get.k3s.io | sh -s - server \
                --disable traefik \
                --write-kubeconfig-mode 644
INSTALL
        
        # Create worker nodes
        TOKEN=$(ssh -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$MASTER_IP "cat /var/lib/rancher/k3s/server/node-token")
        
        for i in 1 2; do
            log "Creating worker node $i..."
            hcloud server create \
                --name eutlas-worker-$i \
                --type cpx41 \
                --image ubuntu-22.04 \
                --location $LOCATION \
                --ssh-key eutlas-key \
                --label cluster=eutlas
            
            WORKER_IP=$(hcloud server ip eutlas-worker-$i)
            sleep 20
            
            ssh -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$WORKER_IP << WORKER
                curl -sfL https://get.k3s.io | K3S_URL=https://$MASTER_IP:6443 K3S_TOKEN=$TOKEN sh -
WORKER
        done
        
        success "Kubernetes cluster created"
    fi
    
    # Get kubeconfig
    log "Fetching kubeconfig..."
    mkdir -p ~/.kube
    scp -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$MASTER_IP:/etc/rancher/k3s/k3s.yaml ~/.kube/eutlas-config
    sed -i.bak "s/127.0.0.1/$MASTER_IP/g" ~/.kube/eutlas-config
    export KUBECONFIG=~/.kube/eutlas-config
    
    kubectl get nodes
    success "Kubernetes cluster ready"
}

# Install infrastructure components
install_infra() {
    header "Installing Infrastructure Components"
    
    export KUBECONFIG=~/.kube/eutlas-config
    
    # Cert-manager
    log "Installing cert-manager..."
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
    sleep 30
    
    # Cluster issuer
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@$DOMAIN
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    # NGINX Ingress
    log "Installing ingress controller..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx --create-namespace \
        --set controller.service.type=LoadBalancer
    
    # MongoDB Operator
    log "Installing MongoDB operator..."
    kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml
    helm repo add mongodb https://mongodb.github.io/helm-charts 2>/dev/null || true
    helm upgrade --install mongodb-operator mongodb/community-operator \
        --namespace mongodb-operator --create-namespace
    
    success "Infrastructure components installed"
}

# Deploy EUTLAS
deploy_eutlas() {
    header "Deploying EUTLAS Application"
    
    export KUBECONFIG=~/.kube/eutlas-config
    
    # Create namespace
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Generate secrets
    JWT_SECRET=$(openssl rand -base64 32)
    MONGO_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    
    # Create secrets
    kubectl create secret generic eutlas-secrets -n $NAMESPACE \
        --from-literal=JWT_SECRET="$JWT_SECRET" \
        --from-literal=RESEND_API_KEY="$RESEND_API_KEY" \
        --from-literal=EMAIL_FROM="noreply@$DOMAIN" \
        --from-literal=EMAIL_FROM_NAME="EUTLAS" \
        --from-literal=NODE_ENV="production" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic eutlas-mongodb-password -n $NAMESPACE \
        --from-literal=password="$MONGO_PASSWORD" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy MongoDB
    log "Deploying MongoDB..."
    cat <<EOF | kubectl apply -f -
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: eutlas-mongodb
  namespace: $NAMESPACE
spec:
  members: 3
  type: ReplicaSet
  version: "7.0.0"
  security:
    authentication:
      modes: ["SCRAM"]
  users:
    - name: eutlas-admin
      db: admin
      passwordSecretRef:
        name: eutlas-mongodb-password
      roles:
        - name: clusterAdmin
          db: admin
        - name: readWriteAnyDatabase
          db: admin
      scramCredentialsSecretName: eutlas-mongodb-scram
  statefulSet:
    spec:
      volumeClaimTemplates:
        - metadata:
            name: data-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 50Gi
        - metadata:
            name: logs-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 5Gi
EOF
    
    # Wait for MongoDB
    log "Waiting for MongoDB (this may take a few minutes)..."
    sleep 60
    
    # Update secrets with MongoDB URI
    MONGO_URI="mongodb://eutlas-admin:$MONGO_PASSWORD@eutlas-mongodb-0.eutlas-mongodb-svc.$NAMESPACE.svc.cluster.local:27017,eutlas-mongodb-1.eutlas-mongodb-svc.$NAMESPACE.svc.cluster.local:27017,eutlas-mongodb-2.eutlas-mongodb-svc.$NAMESPACE.svc.cluster.local:27017/eutlas?authSource=admin&replicaSet=eutlas-mongodb"
    
    kubectl patch secret eutlas-secrets -n $NAMESPACE \
        --type='json' \
        -p='[{"op": "add", "path": "/data/MONGODB_URI", "value": "'$(echo -n "$MONGO_URI" | base64)'"}]'
    
    # Deploy Redis
    log "Deploying Redis..."
    helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
    helm upgrade --install eutlas-redis bitnami/redis \
        --namespace $NAMESPACE \
        --set architecture=standalone \
        --set auth.enabled=false
    
    # Deploy Backend
    log "Deploying backend..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-backend
  namespace: $NAMESPACE
spec:
  replicas: 2
  selector:
    matchLabels:
      app: eutlas
      component: backend
  template:
    metadata:
      labels:
        app: eutlas
        component: backend
    spec:
      containers:
        - name: backend
          image: ghcr.io/stschuer/eutlas-backend:latest
          ports:
            - containerPort: 4000
          envFrom:
            - secretRef:
                name: eutlas-secrets
          env:
            - name: PORT
              value: "4000"
            - name: REDIS_URL
              value: "redis://eutlas-redis-master:6379"
            - name: FRONTEND_URL
              value: "https://app.$DOMAIN"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-backend
  namespace: $NAMESPACE
spec:
  selector:
    app: eutlas
    component: backend
  ports:
    - port: 4000
EOF
    
    # Deploy Frontend
    log "Deploying frontend..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-frontend
  namespace: $NAMESPACE
spec:
  replicas: 2
  selector:
    matchLabels:
      app: eutlas
      component: frontend
  template:
    metadata:
      labels:
        app: eutlas
        component: frontend
    spec:
      containers:
        - name: frontend
          image: ghcr.io/stschuer/eutlas-frontend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              value: "https://app.$DOMAIN/api/v1"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-frontend
  namespace: $NAMESPACE
spec:
  selector:
    app: eutlas
    component: frontend
  ports:
    - port: 3000
EOF
    
    # Create Ingress
    log "Creating ingress..."
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eutlas
  namespace: $NAMESPACE
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.$DOMAIN
      secretName: eutlas-tls
  rules:
    - host: app.$DOMAIN
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: eutlas-backend
                port:
                  number: 4000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: eutlas-frontend
                port:
                  number: 3000
EOF
    
    success "EUTLAS deployed"
}

# Print summary
summary() {
    header "Deployment Complete!"
    
    export KUBECONFIG=~/.kube/eutlas-config
    
    MASTER_IP=$(hcloud server ip eutlas-master)
    LB_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
    
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              EUTLAS DEPLOYMENT SUCCESSFUL                 ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Cluster Master:${NC}    $MASTER_IP"
    echo -e "  ${CYAN}Load Balancer:${NC}     $LB_IP"
    echo -e "  ${CYAN}Kubeconfig:${NC}        ~/.kube/eutlas-config"
    echo ""
    echo -e "  ${YELLOW}Next Steps:${NC}"
    echo "  1. Configure DNS: app.$DOMAIN → $LB_IP"
    echo "  2. Wait for SSL certificate (5-10 min)"
    echo "  3. Access: https://app.$DOMAIN"
    echo ""
    echo -e "  ${CYAN}Useful Commands:${NC}"
    echo "  export KUBECONFIG=~/.kube/eutlas-config"
    echo "  kubectl get pods -n eutlas"
    echo "  kubectl logs -n eutlas -l app=eutlas -f"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
}

# Main
main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║            EUTLAS Quick Start Deployment                  ║${NC}"
    echo -e "${CYAN}║         MongoDB Atlas Clone for EU Infrastructure        ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    validate
    setup_ssh
    create_cluster
    install_infra
    deploy_eutlas
    summary
}

main "$@"

