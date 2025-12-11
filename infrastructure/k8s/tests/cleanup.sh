#!/bin/bash

# Cleanup all EUTLAS test resources from Kubernetes

NAMESPACE="eutlas-test"

echo "Cleaning up test resources in namespace: $NAMESPACE"

# Delete MongoDB resources
kubectl delete mongodbcommunity --all -n $NAMESPACE --ignore-not-found

# Delete secrets
kubectl delete secrets --all -n $NAMESPACE --ignore-not-found

# Delete network policies
kubectl delete networkpolicy --all -n $NAMESPACE --ignore-not-found

# Delete PVCs
kubectl delete pvc --all -n $NAMESPACE --ignore-not-found

# Wait for resources to be deleted
sleep 10

# Delete namespace (optional)
read -p "Delete namespace $NAMESPACE? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    kubectl delete namespace $NAMESPACE --ignore-not-found
    echo "Namespace deleted"
else
    echo "Namespace retained"
fi

echo "Cleanup complete"



