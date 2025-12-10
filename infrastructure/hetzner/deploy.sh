#!/bin/bash
#
# EUTLAS Hetzner Infrastructure Deployment Script
# This script sets up the complete EUTLAS infrastructure on Hetzner Cloud
#
# Prerequisites:
#   - Hetzner Cloud API Token
#   - hcloud CLI installed (brew install hcloud / apt install hcloud-cli)
#   - kubectl installed
#   - helm installed
#
# Usage:
#   export HCLOUD_TOKEN="your-hetzner-api-token"
#   ./deploy.sh
#

set -e

# Configuration
RANCHER_LOCATION="fsn1"
PROD_LOCATION="fsn1"
STAGING_LOCATION="nbg1"
SSH_KEY_NAME="eutlas-deploy"
DOMAIN="eutlas.eu"  # Change this to your domain

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if [ -z "$HCLOUD_TOKEN" ]; then
        log_error "HCLOUD_TOKEN environment variable is not set"
        echo "Please set it: export HCLOUD_TOKEN='your-token'"
        exit 1
    fi
    
    for cmd in hcloud kubectl helm ssh-keygen; do
        if ! command -v $cmd &> /dev/null; then
            log_error "$cmd is required but not installed"
            exit 1
        fi
    done
    
    log_success "All prerequisites met"
}

# Create or use existing SSH key
setup_ssh_key() {
    log_info "Setting up SSH key..."
    
    if ! hcloud ssh-key describe $SSH_KEY_NAME &> /dev/null; then
        if [ ! -f ~/.ssh/eutlas_rsa ]; then
            ssh-keygen -t rsa -b 4096 -f ~/.ssh/eutlas_rsa -N "" -C "eutlas-deploy"
        fi
        hcloud ssh-key create --name $SSH_KEY_NAME --public-key-from-file ~/.ssh/eutlas_rsa.pub
        log_success "SSH key created"
    else
        log_info "SSH key already exists"
    fi
}

# Create network
create_network() {
    log_info "Creating private network..."
    
    if ! hcloud network describe eutlas-network &> /dev/null; then
        hcloud network create --name eutlas-network --ip-range 10.0.0.0/8
        hcloud network add-subnet eutlas-network --type server --network-zone eu-central --ip-range 10.0.0.0/16
        log_success "Network created"
    else
        log_info "Network already exists"
    fi
}

# Create Rancher management server
create_rancher_server() {
    log_info "Creating Rancher management server..."
    
    if ! hcloud server describe rancher-mgmt &> /dev/null; then
        hcloud server create \
            --name rancher-mgmt \
            --type cpx31 \
            --image ubuntu-22.04 \
            --location $RANCHER_LOCATION \
            --ssh-key $SSH_KEY_NAME \
            --network eutlas-network \
            --label role=rancher
        
        RANCHER_IP=$(hcloud server ip rancher-mgmt)
        log_success "Rancher server created at $RANCHER_IP"
        
        # Wait for server to be ready
        log_info "Waiting for server to be ready..."
        sleep 30
        
        # Install Docker and Rancher
        log_info "Installing Docker and Rancher..."
        ssh -o StrictHostKeyChecking=no -i ~/.ssh/eutlas_rsa root@$RANCHER_IP << 'EOF'
            # Install Docker
            curl -fsSL https://get.docker.com | sh
            
            # Install Rancher
            docker run -d --name rancher --restart=unless-stopped \
                -p 80:80 -p 443:443 \
                --privileged \
                -v /opt/rancher:/var/lib/rancher \
                rancher/rancher:latest \
                --acme-domain rancher.eutlas.eu
            
            echo "Rancher installed successfully"
EOF
        
        log_success "Rancher installed at https://$RANCHER_IP"
        echo ""
        echo "=============================================="
        echo "IMPORTANT: Rancher Bootstrap"
        echo "=============================================="
        echo "1. Point DNS: rancher.$DOMAIN -> $RANCHER_IP"
        echo "2. Access: https://rancher.$DOMAIN"
        echo "3. Get initial password:"
        echo "   ssh root@$RANCHER_IP docker logs rancher 2>&1 | grep 'Bootstrap Password'"
        echo "=============================================="
    else
        RANCHER_IP=$(hcloud server ip rancher-mgmt)
        log_info "Rancher server already exists at $RANCHER_IP"
    fi
}

# Create Kubernetes cluster nodes
create_k8s_cluster() {
    local CLUSTER_NAME=$1
    local LOCATION=$2
    local CP_COUNT=$3
    local WORKER_COUNT=$4
    local CP_TYPE=$5
    local WORKER_TYPE=$6
    
    log_info "Creating $CLUSTER_NAME cluster in $LOCATION..."
    
    # Create control plane nodes
    for i in $(seq 1 $CP_COUNT); do
        NODE_NAME="${CLUSTER_NAME}-cp-${i}"
        if ! hcloud server describe $NODE_NAME &> /dev/null; then
            hcloud server create \
                --name $NODE_NAME \
                --type $CP_TYPE \
                --image ubuntu-22.04 \
                --location $LOCATION \
                --ssh-key $SSH_KEY_NAME \
                --network eutlas-network \
                --label cluster=$CLUSTER_NAME \
                --label role=controlplane
            log_success "Created $NODE_NAME"
        fi
    done
    
    # Create worker nodes
    for i in $(seq 1 $WORKER_COUNT); do
        NODE_NAME="${CLUSTER_NAME}-worker-${i}"
        if ! hcloud server describe $NODE_NAME &> /dev/null; then
            hcloud server create \
                --name $NODE_NAME \
                --type $WORKER_TYPE \
                --image ubuntu-22.04 \
                --location $LOCATION \
                --ssh-key $SSH_KEY_NAME \
                --network eutlas-network \
                --label cluster=$CLUSTER_NAME \
                --label role=worker
            log_success "Created $NODE_NAME"
        fi
    done
    
    log_success "$CLUSTER_NAME cluster nodes created"
}

# Create load balancer
create_load_balancer() {
    local CLUSTER_NAME=$1
    local LOCATION=$2
    
    log_info "Creating load balancer for $CLUSTER_NAME..."
    
    if ! hcloud load-balancer describe ${CLUSTER_NAME}-lb &> /dev/null; then
        hcloud load-balancer create \
            --name ${CLUSTER_NAME}-lb \
            --type lb11 \
            --location $LOCATION \
            --label cluster=$CLUSTER_NAME
        
        # Add targets (will be done after cluster creation)
        log_success "Load balancer created"
    else
        log_info "Load balancer already exists"
    fi
}

# Print cluster info
print_cluster_info() {
    local CLUSTER_NAME=$1
    
    echo ""
    echo "=============================================="
    echo "$CLUSTER_NAME Cluster Nodes"
    echo "=============================================="
    hcloud server list -l cluster=$CLUSTER_NAME -o columns=name,ipv4,status
    echo "=============================================="
}

# Main deployment
main() {
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║     EUTLAS Infrastructure Deployment       ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    
    check_prerequisites
    setup_ssh_key
    create_network
    
    # Create Rancher management server
    create_rancher_server
    
    echo ""
    read -p "Press Enter after Rancher is configured and clusters are created via Rancher UI..."
    
    log_success "Infrastructure deployment complete!"
    
    echo ""
    echo "=============================================="
    echo "Next Steps:"
    echo "=============================================="
    echo "1. Access Rancher at https://rancher.$DOMAIN"
    echo "2. Create 'eutlas-production' cluster (FSN1)"
    echo "3. Create 'eutlas-staging' cluster (NBG1)"
    echo "4. Run: ./install-eutlas.sh"
    echo "=============================================="
}

main "$@"

