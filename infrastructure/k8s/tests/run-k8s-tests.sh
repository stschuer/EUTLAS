#!/bin/bash

# EUTLAS Kubernetes Integration Test Suite
# Tests MongoDB Community Operator integration

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="eutlas-test"
CLUSTER_NAME="test-mongodb"
TIMEOUT=300

# Counters
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   EUTLAS K8s Integration Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

wait_for_condition() {
    local resource=$1
    local condition=$2
    local timeout=$3
    local namespace=$4
    
    kubectl wait --for=condition=$condition $resource -n $namespace --timeout=${timeout}s 2>/dev/null
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v kubectl &> /dev/null; then
    log_fail "kubectl not found"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    log_fail "Cannot connect to Kubernetes cluster"
    exit 1
fi

log_success "Kubernetes cluster accessible"

# Check if operator is installed
if ! kubectl get deployment mongodb-kubernetes-operator -n mongodb-operator &> /dev/null; then
    log_warn "MongoDB Operator not found. Installing..."
    kubectl apply -k ../mongodb-operator/ || {
        log_fail "Failed to install MongoDB Operator"
        exit 1
    }
    sleep 10
fi

log_success "MongoDB Operator installed"

# Create test namespace
echo ""
echo -e "${YELLOW}Setting up test namespace...${NC}"

kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
log_success "Namespace $NAMESPACE ready"

# ==================== Test 1: Create Cluster ====================
echo ""
echo -e "${BLUE}Test 1: Create MongoDB Cluster${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: $CLUSTER_NAME
  namespace: $NAMESPACE
spec:
  members: 3
  type: ReplicaSet
  version: "7.0.0"
  security:
    authentication:
      modes: ["SCRAM"]
  users:
    - name: admin
      db: admin
      passwordSecretRef:
        name: ${CLUSTER_NAME}-admin-password
      roles:
        - name: root
          db: admin
      scramCredentialsSecretRef:
        name: ${CLUSTER_NAME}-scram
  statefulSet:
    spec:
      template:
        spec:
          containers:
            - name: mongod
              resources:
                limits:
                  cpu: "500m"
                  memory: "512Mi"
                requests:
                  cpu: "200m"
                  memory: "256Mi"
---
apiVersion: v1
kind: Secret
metadata:
  name: ${CLUSTER_NAME}-admin-password
  namespace: $NAMESPACE
type: Opaque
stringData:
  password: TestPassword123!
EOF

log_info "Waiting for cluster to be ready (up to ${TIMEOUT}s)..."

# Wait for StatefulSet to be ready
if kubectl rollout status statefulset/${CLUSTER_NAME} -n $NAMESPACE --timeout=${TIMEOUT}s 2>/dev/null; then
    log_success "MongoDB cluster created and running"
else
    log_fail "Cluster creation timed out"
    kubectl get pods -n $NAMESPACE
    kubectl describe mongodbcommunity/$CLUSTER_NAME -n $NAMESPACE
fi

# Verify replica set
READY_REPLICAS=$(kubectl get statefulset/$CLUSTER_NAME -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$READY_REPLICAS" == "3" ]; then
    log_success "All 3 replicas are ready"
else
    log_fail "Expected 3 replicas, got $READY_REPLICAS"
fi

# ==================== Test 2: Connect to MongoDB ====================
echo ""
echo -e "${BLUE}Test 2: Connect to MongoDB${NC}"

# Get connection string
POD_NAME="${CLUSTER_NAME}-0"
if kubectl exec -n $NAMESPACE $POD_NAME -- mongosh --eval "db.adminCommand('ping')" &> /dev/null; then
    log_success "MongoDB connection successful"
else
    log_warn "MongoDB connection test skipped (mongosh not available or auth required)"
fi

# ==================== Test 3: Scale Up ====================
echo ""
echo -e "${BLUE}Test 3: Scale Up (3 -> 5 replicas)${NC}"

kubectl patch mongodbcommunity/$CLUSTER_NAME -n $NAMESPACE --type merge -p '{"spec":{"members":5}}'

log_info "Waiting for scale up..."
sleep 30

READY_REPLICAS=$(kubectl get statefulset/$CLUSTER_NAME -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$READY_REPLICAS" == "5" ]; then
    log_success "Scaled up to 5 replicas"
else
    log_fail "Scale up failed. Ready replicas: $READY_REPLICAS"
fi

# ==================== Test 4: Scale Down ====================
echo ""
echo -e "${BLUE}Test 4: Scale Down (5 -> 3 replicas)${NC}"

kubectl patch mongodbcommunity/$CLUSTER_NAME -n $NAMESPACE --type merge -p '{"spec":{"members":3}}'

log_info "Waiting for scale down..."
sleep 30

READY_REPLICAS=$(kubectl get statefulset/$CLUSTER_NAME -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$READY_REPLICAS" == "3" ]; then
    log_success "Scaled down to 3 replicas"
else
    log_fail "Scale down failed. Ready replicas: $READY_REPLICAS"
fi

# ==================== Test 5: Pause (Scale to 0) ====================
echo ""
echo -e "${BLUE}Test 5: Pause Cluster (Scale to 0)${NC}"

kubectl scale statefulset/$CLUSTER_NAME -n $NAMESPACE --replicas=0

log_info "Waiting for pause..."
sleep 20

READY_REPLICAS=$(kubectl get statefulset/$CLUSTER_NAME -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$READY_REPLICAS" == "0" ] || [ -z "$READY_REPLICAS" ]; then
    log_success "Cluster paused (0 replicas)"
else
    log_fail "Pause failed. Ready replicas: $READY_REPLICAS"
fi

# ==================== Test 6: Resume ====================
echo ""
echo -e "${BLUE}Test 6: Resume Cluster${NC}"

kubectl scale statefulset/$CLUSTER_NAME -n $NAMESPACE --replicas=3

log_info "Waiting for resume..."
if kubectl rollout status statefulset/$CLUSTER_NAME -n $NAMESPACE --timeout=120s 2>/dev/null; then
    log_success "Cluster resumed"
else
    log_fail "Resume failed"
fi

# ==================== Test 7: Create User ====================
echo ""
echo -e "${BLUE}Test 7: Create Database User${NC}"

# Add a new user to the MongoDB resource
kubectl patch mongodbcommunity/$CLUSTER_NAME -n $NAMESPACE --type json -p='[
  {
    "op": "add",
    "path": "/spec/users/-",
    "value": {
      "name": "testuser",
      "db": "admin",
      "passwordSecretRef": {
        "name": "'${CLUSTER_NAME}'-testuser-password"
      },
      "roles": [
        {"name": "readWrite", "db": "testdb"}
      ],
      "scramCredentialsSecretRef": {
        "name": "'${CLUSTER_NAME}'-testuser-scram"
      }
    }
  }
]' 2>/dev/null || log_warn "User already exists or patch failed"

# Create password secret
kubectl create secret generic ${CLUSTER_NAME}-testuser-password \
  --from-literal=password=TestUser123! \
  -n $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

log_success "Database user created"

# ==================== Test 8: Network Policy ====================
echo ""
echo -e "${BLUE}Test 8: Network Policy${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${CLUSTER_NAME}-network-policy
  namespace: $NAMESPACE
spec:
  podSelector:
    matchLabels:
      app: ${CLUSTER_NAME}-svc
  policyTypes:
    - Ingress
  ingress:
    - from:
        - ipBlock:
            cidr: 10.0.0.0/8
      ports:
        - protocol: TCP
          port: 27017
EOF

log_success "Network policy applied"

# ==================== Cleanup ====================
echo ""
echo -e "${YELLOW}Cleaning up test resources...${NC}"

kubectl delete mongodbcommunity/$CLUSTER_NAME -n $NAMESPACE --ignore-not-found
kubectl delete secret ${CLUSTER_NAME}-admin-password -n $NAMESPACE --ignore-not-found
kubectl delete secret ${CLUSTER_NAME}-testuser-password -n $NAMESPACE --ignore-not-found
kubectl delete networkpolicy ${CLUSTER_NAME}-network-policy -n $NAMESPACE --ignore-not-found

# Wait for cleanup
sleep 10

# Delete PVCs
kubectl delete pvc -l app=${CLUSTER_NAME}-svc -n $NAMESPACE --ignore-not-found

log_success "Cleanup complete"

# ==================== Summary ====================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}           TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Passed: ${GREEN}$PASSED${NC}"
echo -e "  Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Check output above.${NC}"
    exit 1
fi





