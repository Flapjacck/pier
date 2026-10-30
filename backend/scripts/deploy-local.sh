#!/usr/bin/env bash
# Deploy pier-backend to k3s: build image, import into containerd, apply manifests, roll out.
# Usage: ./scripts/deploy-local.sh [TAG]
# If TAG is not provided, uses git short SHA with -dirty suffix if tree has uncommitted changes.

set -euo pipefail

# Resolve backend directory from script location so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment for K3S_HOST, K3S_SSH_USER, and PIER_API_TOKEN.
# Parse .env file safely: skip comments and blank lines, strip optional quotes, no eval.
if [[ -f "$BACKEND_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    # Skip comments and blank lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    
    # Strip leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Strip optional surrounding quotes
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    
    # Export only if not already in environment
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$BACKEND_DIR/.env"
fi

# Require essential variables
if [[ -z "${K3S_HOST:-}" ]]; then
  echo "Error: K3S_HOST not set. Set it in backend/.env or as an environment variable."
  exit 1
fi

if [[ -z "${K3S_SSH_USER:-}" ]]; then
  echo "Error: K3S_SSH_USER not set. Set it in backend/.env or as an environment variable."
  exit 1
fi

if [[ -z "${PIER_API_TOKEN:-}" ]]; then
  echo "Error: PIER_API_TOKEN not set. Set it in backend/.env or as an environment variable."
  exit 1
fi

# Verify kubectl can reach the cluster
if ! kubectl get nodes > /dev/null 2>&1; then
  echo "Error: kubectl cannot reach the cluster. Check KUBECONFIG."
  exit 1
fi

# Determine TAG: git short SHA with -dirty suffix if tree has changes.
if [[ -n "${1:-}" ]]; then
  TAG="$1"
else
  TAG=$(git -C "$BACKEND_DIR" rev-parse --short HEAD)
  if ! git -C "$BACKEND_DIR" diff-index --quiet HEAD -- 2>/dev/null; then
    TAG="${TAG}-dirty"
  fi
fi

echo "==> Building image pier-backend:$TAG"
docker build -t "pier-backend:$TAG" "$BACKEND_DIR"

echo "==> Importing image into k3s via SSH"
docker save "pier-backend:$TAG" | ssh "$K3S_SSH_USER@$K3S_HOST" sudo k3s ctr images import -

echo "==> Applying manifests in order"
kubectl apply -f "$BACKEND_DIR/k8s/namespace.yaml"
kubectl apply -f "$BACKEND_DIR/k8s/rbac.yaml"
kubectl apply -f "$BACKEND_DIR/k8s/rbac-apps.yaml"

# Apply optional manifests if they exist
if [[ -f "$BACKEND_DIR/k8s/quota.yaml" ]]; then
  kubectl apply -f "$BACKEND_DIR/k8s/quota.yaml"
fi
if [[ -f "$BACKEND_DIR/k8s/policy-services.yaml" ]]; then
  kubectl apply -f "$BACKEND_DIR/k8s/policy-services.yaml"
fi

kubectl apply -f "$BACKEND_DIR/k8s/deployment.yaml"

echo "==> Creating or updating secret (token redacted)"
# Create or update the secret without echoing it (careful not to set -x after this point).
kubectl -n default create secret generic pier-backend-secrets \
  --from-literal="PIER_API_TOKEN=$PIER_API_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Setting image and rolling out"
kubectl -n default set image "deploy/pier-backend" "api=pier-backend:$TAG"
kubectl -n default rollout status "deploy/pier-backend" --timeout=120s

echo "==> Deployment successful!"
echo ""
echo "Troubleshooting:"
echo "  kubectl -n default describe pod -l app=pier-backend"
echo "  kubectl -n default logs -l app=pier-backend"
