#!/usr/bin/env bash
set -euo pipefail

PROD_HOST="${PROD_HOST:-46.224.9.177}"
PROD_USER="${PROD_USER:-root}"
PROD_KEY="${PROD_KEY:-$HOME/.ssh/eutlas-prod}"
LOCAL_PORT="${LOCAL_PORT:-6443}"
REMOTE_PORT="${REMOTE_PORT:-6443}"
KUBECONFIG_OUT="${KUBECONFIG_OUT:-$HOME/.kube/config-eutlas-prod}"

if [[ ! -f "$PROD_KEY" ]]; then
  echo "Missing SSH key: $PROD_KEY" >&2
  exit 1
fi

mkdir -p "$(dirname "$KUBECONFIG_OUT")" "$HOME/.ssh"

if ! ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
  -i "$PROD_KEY" "${PROD_USER}@${PROD_HOST}" "test -r /etc/rancher/rke2/rke2.yaml"; then
  echo "Cannot read /etc/rancher/rke2/rke2.yaml on ${PROD_USER}@${PROD_HOST}" >&2
  exit 1
fi

if ! nc -z 127.0.0.1 "$LOCAL_PORT" >/dev/null 2>&1; then
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ExitOnForwardFailure=yes \
    -i "$PROD_KEY" \
    -f -N -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
    "${PROD_USER}@${PROD_HOST}"
fi

ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
  -i "$PROD_KEY" "${PROD_USER}@${PROD_HOST}" \
  "cat /etc/rancher/rke2/rke2.yaml" \
  | sed -E "s#server: https://[^:]+:[0-9]+#server: https://127.0.0.1:${LOCAL_PORT}#" \
  > "$KUBECONFIG_OUT"

chmod 600 "$KUBECONFIG_OUT"

echo "Wrote kubeconfig: $KUBECONFIG_OUT"
echo "Use it with:"
echo "  export KUBECONFIG=\"$KUBECONFIG_OUT\""
echo "  kubectl get nodes"
