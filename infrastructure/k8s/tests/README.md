# Kubernetes Integration Tests

These scripts validate real MongoDB cluster operations with the MongoDB Community Operator.

## Prerequisites

1. **Kubernetes Cluster** - A running K8s cluster (minikube, kind, or real cluster)
2. **kubectl** - Configured and connected to your cluster
3. **MongoDB Community Operator** - Installed in the cluster

## Quick Start

### 1. Install MongoDB Community Operator

```bash
# Apply the operator
kubectl apply -k ../mongodb-operator/

# Verify operator is running
kubectl get pods -n mongodb-operator
```

### 2. Install Hetzner CSI Driver (for production)

```bash
kubectl apply -f ../storage/hetzner-storage-class.yaml
```

### 3. Run Tests

```bash
# Full test suite
./run-k8s-tests.sh

# Individual tests
./test-cluster-create.sh
./test-cluster-scale.sh
./test-cluster-backup.sh
```

## Test Scripts

| Script | Description |
|--------|-------------|
| `run-k8s-tests.sh` | Full test suite |
| `test-cluster-create.sh` | Test cluster provisioning |
| `test-cluster-scale.sh` | Test resize/pause/resume |
| `test-cluster-backup.sh` | Test backup and restore |
| `cleanup.sh` | Remove all test resources |

## Test Namespaces

Tests create resources in the `eutlas-test` namespace:

```bash
# View test resources
kubectl get all -n eutlas-test

# View MongoDB resources
kubectl get mongodbcommunity -n eutlas-test
```

## Expected Results

✅ **Cluster Create**: MongoDB replica set with 3 members
✅ **Scale Up**: Increase replica count to 5
✅ **Scale Down**: Decrease replica count to 3
✅ **Pause**: Scale to 0 replicas
✅ **Resume**: Scale back to 3 replicas
✅ **Backup**: Create manual backup
✅ **Restore**: Restore from backup

## Troubleshooting

### Operator not starting
```bash
kubectl logs -n mongodb-operator -l app=mongodb-kubernetes-operator
```

### Cluster stuck in pending
```bash
kubectl describe mongodbcommunity -n eutlas-test
kubectl get events -n eutlas-test
```

### Storage issues
```bash
kubectl get pvc -n eutlas-test
kubectl describe pvc -n eutlas-test
```





