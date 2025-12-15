# Configure Rancher Machine Pool Autoscaling

## Prerequisites

1. Access to Rancher UI (admin permissions)
2. Hetzner Cloud API token configured in Rancher

## Step-by-Step Configuration

### Step 1: Access Cluster Settings

1. Log in to Rancher UI
2. Go to **Cluster Management**
3. Find your cluster (e.g., `aihub-production`)
4. Click on the cluster name

### Step 2: Edit Machine Pool

1. Click **Machine Pools** tab
2. Find the worker pool (e.g., `production-pool`)
3. Click the **⋮** menu → **Edit Config**

### Step 3: Enable Autoscaling

In the Machine Pool configuration:

```yaml
# Autoscaling Configuration
autoscaling:
  enabled: true
  minReplicas: 3      # Minimum number of nodes
  maxReplicas: 20     # Maximum number of nodes
```

Fill in the form:
- **Enable Autoscaling**: ✅ Checked
- **Minimum Scale**: 3
- **Maximum Scale**: 20

### Step 4: Configure Node Resources

For each node in the pool:

| Setting | Value | Notes |
|---------|-------|-------|
| **Machine Type** | cpx31 | 4 vCPU, 8GB RAM, ~€30/month |
| **Location** | fsn1 | Falkenstein, Germany |
| **Image** | ubuntu-22.04 | |

### Step 5: Set Node Labels

Add these labels to worker nodes for MongoDB scheduling:

```yaml
labels:
  node.kubernetes.io/instance-type: cpx31
  eutlas.eu/node-pool: mongodb
  topology.kubernetes.io/zone: fsn1
```

### Step 6: Save and Apply

1. Click **Save**
2. Rancher will apply the autoscaling configuration
3. Monitor in **Cluster** → **Nodes** view

## How Autoscaling Works

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTOSCALING FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User creates MongoDB cluster                             │
│     ↓                                                        │
│  2. Pod created but PENDING (no resources)                   │
│     ↓                                                        │
│  3. Rancher Cluster Agent detects pending pods               │
│     ↓                                                        │
│  4. Machine Pool scales up (provisions new Hetzner VM)       │
│     ↓                                                        │
│  5. New node joins cluster (2-3 minutes)                     │
│     ↓                                                        │
│  6. Pod scheduled on new node                                │
│     ↓                                                        │
│  7. Cluster ready!                                           │
│                                                              │
│  --- SCALE DOWN ---                                          │
│                                                              │
│  1. Cluster deleted, node utilization < 50%                  │
│     ↓                                                        │
│  2. Wait 10 minutes (cooldown)                               │
│     ↓                                                        │
│  3. Pods drained from underutilized node                     │
│     ↓                                                        │
│  4. Node removed, Hetzner VM deleted                         │
│     ↓                                                        │
│  5. Cost reduced!                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring Autoscaling

### View Current Scale

```bash
# Check nodes
kubectl get nodes

# Check pending pods
kubectl get pods -A | grep Pending

# Check autoscaler events
kubectl get events -A --sort-by='.lastTimestamp' | grep -i scale
```

### Rancher UI

1. **Cluster** → **Nodes**: View all nodes and their status
2. **Cluster** → **Events**: View scaling events
3. **Workload** → **Pods**: Check for pending pods

## Troubleshooting

### Pods stuck in Pending

1. Check why pod is pending:
   ```bash
   kubectl describe pod <pod-name> -n <namespace>
   ```

2. Common causes:
   - **Insufficient cpu/memory**: Autoscaler should add nodes
   - **Node selector mismatch**: Check labels
   - **PVC pending**: Check storage class

### Nodes not scaling up

1. Check Rancher logs:
   - Go to **Cluster** → **Logs**
   - Look for autoscaler messages

2. Verify Hetzner API token:
   - **Cluster** → **Edit Config** → **Cloud Credentials**

3. Check quota limits:
   - Hetzner has server limits per project
   - Increase via Hetzner Support if needed

### Nodes not scaling down

- Minimum 10-minute cooldown
- System pods (kube-system) prevent scale-down
- Pods with local storage prevent scale-down

## Cost Management

| Nodes | Monthly Cost | Cluster Capacity |
|-------|--------------|------------------|
| 3 (min) | €90 | ~15 DEV clusters |
| 5 | €150 | ~25 DEV or 8 MEDIUM |
| 10 | €300 | ~50 DEV or 16 MEDIUM |
| 20 (max) | €600 | ~100 DEV or 33 MEDIUM |

## Next Steps

After configuring autoscaling:

1. Test by creating multiple clusters
2. Monitor node scaling in Rancher UI
3. Set up alerts for maximum node count
4. Configure cost alerts in Hetzner Cloud


