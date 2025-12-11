#!/bin/bash
#
# EUTLAS Quick Start - IP-Based Deployment (No Domain Required)
#
# This deploys EUTLAS accessible directly via IP address.
# Perfect for testing and development.
#
# Usage:
#   export HCLOUD_TOKEN="your-hetzner-api-token"
#   export RESEND_API_KEY="re_..."  # Optional for email features
#   ./quick-start-ip.sh
#

set -e

# Configuration
LOCATION=${LOCATION:-"fsn1"}
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
    
    for cmd in hcloud kubectl helm curl; do
        command -v $cmd &>/dev/null || error "$cmd is not installed"
        log "Found: $cmd"
    done
    
    # Resend is optional
    if [ -z "$RESEND_API_KEY" ]; then
        warn "RESEND_API_KEY not set - email features will be disabled"
        RESEND_API_KEY="not-configured"
    fi
    
    success "Prerequisites validated"
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

# Create K3s cluster
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
        log "Waiting for server to boot..."
        sleep 45
        
        # Install K3s with NodePort access
        log "Installing K3s..."
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i ~/.ssh/eutlas_ed25519 root@$MASTER_IP << 'INSTALL'
            curl -sfL https://get.k3s.io | sh -s - server \
                --disable traefik \
                --write-kubeconfig-mode 644 \
                --node-external-ip $(curl -s ifconfig.me)
INSTALL
        
        success "K3s installed"
        
        # Create one worker node for MongoDB
        log "Creating worker node..."
        hcloud server create \
            --name eutlas-worker-1 \
            --type cpx41 \
            --image ubuntu-22.04 \
            --location $LOCATION \
            --ssh-key eutlas-key \
            --label cluster=eutlas
        
        WORKER_IP=$(hcloud server ip eutlas-worker-1)
        sleep 30
        
        TOKEN=$(ssh -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$MASTER_IP "cat /var/lib/rancher/k3s/server/node-token")
        
        ssh -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$WORKER_IP << WORKER
            curl -sfL https://get.k3s.io | K3S_URL=https://$MASTER_IP:6443 K3S_TOKEN=$TOKEN sh -
WORKER
        
        success "Worker node added"
    fi
    
    # Get kubeconfig
    log "Fetching kubeconfig..."
    mkdir -p ~/.kube
    scp -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_ed25519 root@$MASTER_IP:/etc/rancher/k3s/k3s.yaml ~/.kube/eutlas-config
    sed -i.bak "s/127.0.0.1/$MASTER_IP/g" ~/.kube/eutlas-config
    export KUBECONFIG=~/.kube/eutlas-config
    
    log "Waiting for nodes to be ready..."
    sleep 10
    kubectl get nodes
    success "Kubernetes cluster ready"
}

# Install infrastructure (minimal - no cert-manager needed)
install_infra() {
    header "Installing Infrastructure"
    
    export KUBECONFIG=~/.kube/eutlas-config
    
    # NGINX Ingress with NodePort (accessible via IP)
    log "Installing ingress controller..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx --create-namespace \
        --set controller.service.type=NodePort \
        --set controller.service.nodePorts.http=30080 \
        --set controller.service.nodePorts.https=30443
    
    # MongoDB Operator
    log "Installing MongoDB operator..."
    kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml
    helm repo add mongodb https://mongodb.github.io/helm-charts 2>/dev/null || true
    helm upgrade --install mongodb-operator mongodb/community-operator \
        --namespace mongodb-operator --create-namespace
    
    success "Infrastructure installed"
}

# Deploy EUTLAS
deploy_eutlas() {
    header "Deploying EUTLAS Application"
    
    export KUBECONFIG=~/.kube/eutlas-config
    MASTER_IP=$(hcloud server ip eutlas-master)
    APP_URL="http://$MASTER_IP:30080"
    
    # Create namespace
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Generate secrets
    JWT_SECRET=$(openssl rand -base64 32)
    MONGO_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    
    # Create secrets
    log "Creating secrets..."
    kubectl create secret generic eutlas-secrets -n $NAMESPACE \
        --from-literal=JWT_SECRET="$JWT_SECRET" \
        --from-literal=RESEND_API_KEY="$RESEND_API_KEY" \
        --from-literal=EMAIL_FROM="noreply@eutlas.local" \
        --from-literal=EMAIL_FROM_NAME="EUTLAS" \
        --from-literal=NODE_ENV="production" \
        --from-literal=FRONTEND_URL="$APP_URL" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic eutlas-mongodb-password -n $NAMESPACE \
        --from-literal=password="$MONGO_PASSWORD" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy MongoDB (single node for testing)
    log "Deploying MongoDB (this takes 2-3 minutes)..."
    cat <<EOF | kubectl apply -f -
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: eutlas-mongodb
  namespace: $NAMESPACE
spec:
  members: 1
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
                storage: 10Gi
        - metadata:
            name: logs-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 1Gi
EOF
    
    # Wait for MongoDB
    log "Waiting for MongoDB to be ready..."
    sleep 120
    
    # Update secrets with MongoDB URI
    MONGO_URI="mongodb://eutlas-admin:$MONGO_PASSWORD@eutlas-mongodb-0.eutlas-mongodb-svc.$NAMESPACE.svc.cluster.local:27017/eutlas?authSource=admin&replicaSet=eutlas-mongodb"
    
    kubectl patch secret eutlas-secrets -n $NAMESPACE \
        --type='json' \
        -p='[{"op": "add", "path": "/data/MONGODB_URI", "value": "'$(echo -n "$MONGO_URI" | base64)'"}]'
    
    # Deploy Redis
    log "Deploying Redis..."
    helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
    helm upgrade --install eutlas-redis bitnami/redis \
        --namespace $NAMESPACE \
        --set architecture=standalone \
        --set auth.enabled=false \
        --set master.persistence.size=1Gi
    
    # Deploy Backend
    log "Deploying backend..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-backend
  namespace: $NAMESPACE
spec:
  replicas: 1
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
          imagePullPolicy: Always
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
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
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
  replicas: 1
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
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              value: "$APP_URL/api/v1"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "250m"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
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
    
    # Create Ingress (HTTP only, no TLS)
    log "Creating ingress..."
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eutlas
  namespace: $NAMESPACE
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
spec:
  ingressClassName: nginx
  rules:
    - http:
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

# Wait for everything to be ready
wait_for_ready() {
    header "Waiting for Services"
    
    export KUBECONFIG=~/.kube/eutlas-config
    
    log "Waiting for pods to be ready (this may take 2-3 minutes)..."
    
    # Wait for backend
    kubectl wait --for=condition=Available --timeout=300s deployment/eutlas-backend -n $NAMESPACE 2>/dev/null || true
    
    # Wait for frontend
    kubectl wait --for=condition=Available --timeout=300s deployment/eutlas-frontend -n $NAMESPACE 2>/dev/null || true
    
    sleep 10
    kubectl get pods -n $NAMESPACE
}

# Print summary
summary() {
    header "Deployment Complete!"
    
    export KUBECONFIG=~/.kube/eutlas-config
    MASTER_IP=$(hcloud server ip eutlas-master)
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              EUTLAS DEPLOYMENT SUCCESSFUL                 ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Access EUTLAS:${NC}"
    echo -e "  ${GREEN}➜  http://$MASTER_IP:30080${NC}"
    echo ""
    echo -e "  ${CYAN}API Health Check:${NC}"
    echo -e "     curl http://$MASTER_IP:30080/api/v1/health"
    echo ""
    echo -e "  ${CYAN}Server Details:${NC}"
    echo "     Master IP: $MASTER_IP"
    echo "     Kubeconfig: ~/.kube/eutlas-config"
    echo ""
    echo -e "  ${CYAN}Useful Commands:${NC}"
    echo "     export KUBECONFIG=~/.kube/eutlas-config"
    echo "     kubectl get pods -n eutlas"
    echo "     kubectl logs -n eutlas -l component=backend -f"
    echo ""
    echo -e "  ${YELLOW}Note:${NC} First load may take 30-60 seconds as containers start."
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Test the endpoint
    log "Testing API endpoint..."
    sleep 5
    curl -s "http://$MASTER_IP:30080/api/v1/health" || echo "API still starting up..."
}

# Cleanup function
cleanup() {
    echo ""
    read -p "Do you want to destroy all resources? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Cleaning up..."
        hcloud server delete eutlas-master --force 2>/dev/null || true
        hcloud server delete eutlas-worker-1 --force 2>/dev/null || true
        hcloud ssh-key delete eutlas-key 2>/dev/null || true
        rm -f ~/.kube/eutlas-config
        success "Cleanup complete"
    fi
}

# Main
main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║        EUTLAS Quick Start (IP-Based, No Domain)          ║${NC}"
    echo -e "${CYAN}║         MongoDB Atlas Clone for EU Infrastructure        ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    case "${1:-}" in
        cleanup)
            cleanup
            ;;
        *)
            validate
            setup_ssh
            create_cluster
            install_infra
            deploy_eutlas
            wait_for_ready
            summary
            ;;
    esac
}

main "$@"


