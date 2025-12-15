# EUTLAS Kubernetes Cluster Autoscaler

## Overview

This directory contains the configuration for automatic node scaling on the EUTLAS Kubernetes cluster.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    RANCHER CLUSTER MANAGEMENT                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Rancher detects pending pods → Provisions new Hetzner nodes    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Machine Pool                             │ │
│  │                                                             │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │ │
│  │  │ Node 1  │  │ Node 2  │  │ Node 3  │  │ Node N  │ ...  │ │
│  │  │ (CPX31) │  │ (CPX31) │  │ (CPX31) │  │ (auto)  │      │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │ │
│  │                                                             │ │
│  │  Min Nodes: 3        Max Nodes: 20        Auto-scale: ON   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration via Rancher UI

### Step 1: Enable Autoscaling on Machine Pool

1. Go to **Rancher UI** → **Cluster Management**
2. Select your cluster (e.g., `aihub-production`)
3. Click **Machine Pools** tab
4. Edit the worker pool (e.g., `production-pool`)
5. Configure:
   - **Enable Autoscaling**: ✅ Yes
   - **Minimum Nodes**: 3
   - **Maximum Nodes**: 20
   - **Scale Down Delay**: 10 minutes

### Step 2: Configure Node Resources

For each node type, set appropriate labels:

```yaml
# Node labels for scheduling
node.kubernetes.io/instance-type: cpx31
topology.kubernetes.io/zone: fsn1
eutlas.eu/node-pool: mongodb
```

## Alternative: Hetzner Cluster Autoscaler (Manual)

If not using Rancher autoscaling, deploy the Hetzner Cluster Autoscaler directly:

```bash
kubectl apply -f hetzner-autoscaler.yaml
```

## Cost Control

| Setting | Value | Monthly Cost Range |
|---------|-------|-------------------|
| Min Nodes | 3 | €90 (3 × €30 CPX31) |
| Max Nodes | 20 | €600 max (20 × €30 CPX31) |
| Scale Down Delay | 10 min | Prevents thrashing |

## Monitoring

Check autoscaler status:
```bash
# View cluster autoscaler logs (if deployed)
kubectl logs -n kube-system -l app=cluster-autoscaler

# Check node scaling events
kubectl get events -A | grep -i scale

# View pending pods
kubectl get pods -A -o wide | grep Pending
```

## Troubleshooting

### Pods stuck in Pending
1. Check node resources: `kubectl top nodes`
2. Check autoscaler logs: `kubectl logs -n kube-system deployment/cluster-autoscaler`
3. Verify Hetzner API token is valid

### Nodes not scaling down
- Default cooldown is 10 minutes
- Nodes with system pods (kube-system) won't scale down
- Check for pods with local storage or node selectors


