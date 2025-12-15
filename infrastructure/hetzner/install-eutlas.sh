#!/bin/bash
#
# EUTLAS Application Installation Script
# Run this after Rancher clusters are created
#
# Usage:
#   ./install-eutlas.sh [production|staging|both]
#

set -e

# Configuration
NAMESPACE="eutlas"
DOMAIN="eutlas.eu"  # Change this

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check kubectl context
check_context() {
    log_info "Current kubectl context: $(kubectl config current-context)"
    read -p "Is this the correct cluster? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Please switch to the correct context"
        echo "Use: kubectl config use-context <context-name>"
        exit 1
    fi
}

# Install cert-manager
install_cert_manager() {
    log_info "Installing cert-manager..."
    
    if kubectl get namespace cert-manager &> /dev/null; then
        log_info "cert-manager already installed"
        return
    fi
    
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
    
    log_info "Waiting for cert-manager to be ready..."
    kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager -n cert-manager
    kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager-webhook -n cert-manager
    
    # Create ClusterIssuer for Let's Encrypt
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
    
    log_success "cert-manager installed"
}

# Install NGINX Ingress Controller
install_ingress() {
    log_info "Installing NGINX Ingress Controller..."
    
    if kubectl get namespace ingress-nginx &> /dev/null; then
        log_info "Ingress controller already installed"
        return
    fi
    
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    
    helm install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.config.proxy-body-size="100m"
    
    log_info "Waiting for ingress controller..."
    kubectl wait --for=condition=Available --timeout=300s deployment/ingress-nginx-controller -n ingress-nginx
    
    log_success "Ingress controller installed"
    
    # Get Load Balancer IP
    sleep 10
    LB_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    log_info "Load Balancer IP: $LB_IP"
    echo "Point your DNS to: $LB_IP"
}

# Install Hetzner CSI Driver
install_hetzner_csi() {
    log_info "Installing Hetzner CSI Driver..."
    
    if kubectl get storageclass hcloud-volumes &> /dev/null; then
        log_info "Hetzner CSI already installed"
        return
    fi
    
    # Create secret for Hetzner API token
    if [ -z "$HCLOUD_TOKEN" ]; then
        log_error "HCLOUD_TOKEN is required for CSI driver"
        exit 1
    fi
    
    kubectl create secret generic hcloud-csi \
        --from-literal=token=$HCLOUD_TOKEN \
        -n kube-system \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Install CSI driver
    kubectl apply -f https://raw.githubusercontent.com/hetznercloud/csi-driver/main/deploy/kubernetes/hcloud-csi.yml
    
    # Create storage class
    cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: hcloud-volumes
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: csi.hetzner.cloud
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF
    
    log_success "Hetzner CSI Driver installed"
}

# Install MongoDB Community Operator
install_mongodb_operator() {
    log_info "Installing MongoDB Community Operator..."
    
    if kubectl get crd mongodbcommunity.mongodbcommunity.mongodb.com &> /dev/null; then
        log_info "MongoDB Operator already installed"
        return
    fi
    
    # Install CRDs
    kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml
    
    # Install operator
    helm repo add mongodb https://mongodb.github.io/helm-charts
    helm repo update
    
    helm install mongodb-operator mongodb/community-operator \
        --namespace mongodb-operator \
        --create-namespace
    
    log_success "MongoDB Operator installed"
}

# Create EUTLAS namespace and secrets
create_eutlas_namespace() {
    log_info "Creating EUTLAS namespace..."
    
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Check if secrets exist
    if kubectl get secret eutlas-secrets -n $NAMESPACE &> /dev/null; then
        log_info "Secrets already exist"
        return
    fi
    
    echo ""
    echo "=============================================="
    echo "Create EUTLAS Secrets"
    echo "=============================================="
    
    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    
    read -p "Enter MongoDB connection string (or press Enter for managed MongoDB): " MONGODB_URI
    if [ -z "$MONGODB_URI" ]; then
        MONGODB_URI="mongodb://eutlas-admin:WILL_BE_GENERATED@eutlas-mongodb-svc.$NAMESPACE.svc.cluster.local:27017/eutlas?authSource=admin"
    fi
    
    read -p "Enter Resend API Key: " RESEND_API_KEY
    read -p "Enter your email domain (e.g., eutlas.eu): " EMAIL_DOMAIN
    
    kubectl create secret generic eutlas-secrets \
        --namespace $NAMESPACE \
        --from-literal=MONGODB_URI="$MONGODB_URI" \
        --from-literal=JWT_SECRET="$JWT_SECRET" \
        --from-literal=RESEND_API_KEY="$RESEND_API_KEY" \
        --from-literal=EMAIL_FROM="noreply@$EMAIL_DOMAIN" \
        --from-literal=EMAIL_FROM_NAME="EUTLAS" \
        --from-literal=NODE_ENV="production"
    
    log_success "Secrets created"
}

# Deploy MongoDB cluster
deploy_mongodb() {
    log_info "Deploying MongoDB cluster..."
    
    local REPLICAS=${1:-3}
    local STORAGE=${2:-50Gi}
    
    # Generate password
    MONGO_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    
    # Create password secret
    kubectl create secret generic eutlas-mongodb-password \
        --namespace $NAMESPACE \
        --from-literal=password="$MONGO_PASSWORD" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy MongoDB
    cat <<EOF | kubectl apply -f -
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: eutlas-mongodb
  namespace: $NAMESPACE
spec:
  members: $REPLICAS
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
        - name: userAdminAnyDatabase
          db: admin
        - name: readWriteAnyDatabase
          db: admin
      scramCredentialsSecretName: eutlas-mongodb-scram
  additionalMongodConfig:
    storage.wiredTiger.engineConfig.journalCompressor: zlib
  statefulSet:
    spec:
      template:
        spec:
          containers:
            - name: mongod
              resources:
                limits:
                  cpu: "2"
                  memory: 4Gi
                requests:
                  cpu: "1"
                  memory: 2Gi
      volumeClaimTemplates:
        - metadata:
            name: data-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            storageClassName: hcloud-volumes
            resources:
              requests:
                storage: $STORAGE
        - metadata:
            name: logs-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            storageClassName: hcloud-volumes
            resources:
              requests:
                storage: 5Gi
EOF
    
    log_info "Waiting for MongoDB to be ready..."
    kubectl wait --for=condition=Ready --timeout=600s mongodbcommunity/eutlas-mongodb -n $NAMESPACE || true
    
    # Update secrets with correct connection string
    MONGO_CONNECTION="mongodb://eutlas-admin:$MONGO_PASSWORD@eutlas-mongodb-0.$NAMESPACE.svc.cluster.local:27017,eutlas-mongodb-1.$NAMESPACE.svc.cluster.local:27017,eutlas-mongodb-2.$NAMESPACE.svc.cluster.local:27017/eutlas?authSource=admin&replicaSet=eutlas-mongodb"
    
    kubectl patch secret eutlas-secrets -n $NAMESPACE \
        --type='json' \
        -p='[{"op": "replace", "path": "/data/MONGODB_URI", "value": "'$(echo -n $MONGO_CONNECTION | base64)'"}]'
    
    log_success "MongoDB deployed"
}

# Deploy Redis
deploy_redis() {
    log_info "Deploying Redis..."
    
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo update
    
    helm upgrade --install eutlas-redis bitnami/redis \
        --namespace $NAMESPACE \
        --set architecture=standalone \
        --set auth.enabled=false \
        --set master.persistence.storageClass=hcloud-volumes \
        --set master.persistence.size=5Gi
    
    log_success "Redis deployed"
}

# Deploy EUTLAS application
deploy_eutlas() {
    local ENV=${1:-production}
    local HOST=${2:-app.$DOMAIN}
    local REPLICAS=${3:-2}
    
    log_info "Deploying EUTLAS ($ENV)..."
    
    # Backend deployment
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-backend
  namespace: $NAMESPACE
  labels:
    app: eutlas
    component: backend
spec:
  replicas: $REPLICAS
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
            - name: FRONTEND_URL
              value: "https://$HOST"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
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
      targetPort: 4000
EOF
    
    # Frontend deployment
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-frontend
  namespace: $NAMESPACE
  labels:
    app: eutlas
    component: frontend
spec:
  replicas: $REPLICAS
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
              value: "https://$HOST/api/v1"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
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
      targetPort: 3000
EOF
    
    # Ingress
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eutlas
  namespace: $NAMESPACE
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - $HOST
      secretName: eutlas-tls
  rules:
    - host: $HOST
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
    
    log_success "EUTLAS deployed!"
    echo ""
    echo "=============================================="
    echo "Deployment Complete!"
    echo "=============================================="
    echo "URL: https://$HOST"
    echo ""
    echo "Check status:"
    echo "  kubectl get pods -n $NAMESPACE"
    echo "  kubectl get ingress -n $NAMESPACE"
    echo "=============================================="
}

# Main installation
main() {
    local ENV=${1:-both}
    
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║     EUTLAS Application Installation        ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    
    check_context
    
    install_cert_manager
    install_ingress
    install_hetzner_csi
    install_mongodb_operator
    create_eutlas_namespace
    
    if [[ "$ENV" == "production" ]] || [[ "$ENV" == "both" ]]; then
        log_info "Installing for PRODUCTION..."
        deploy_mongodb 3 100Gi
        deploy_redis
        deploy_eutlas production "app.$DOMAIN" 3
    fi
    
    if [[ "$ENV" == "staging" ]] || [[ "$ENV" == "both" ]]; then
        log_info "Installing for STAGING..."
        deploy_mongodb 1 20Gi
        deploy_redis
        deploy_eutlas staging "staging.$DOMAIN" 1
    fi
    
    log_success "Installation complete!"
}

main "$@"




