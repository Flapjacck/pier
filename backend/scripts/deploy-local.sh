#!/usr/bin/env bash
# Deploy pier-backend to k3s: build image, import into containerd, apply manifests, roll out.
# Usage: ./scripts/deploy-local.sh [--dry-run] [TAG]
# If TAG is not provided, uses git short SHA with -dirty suffix if tree has uncommitted changes.
# With --dry-run, uses kubectl apply --dry-run=server and skips docker build/push.

set -euo pipefail

# Resolve directories from script location so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Source load-env.sh to define load_env_file.
source "$SCRIPT_DIR/lib/load-env.sh"

# Parse flags and TAG argument.
DRY_RUN=0
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      TAG="$1"
      shift
      ;;
  esac
done

# Load environment for K3S_HOST, K3S_SSH_USER, PIER_API_TOKEN, PIER_INGRESS_DOMAIN.
if [[ -f "$BACKEND_DIR/.env" ]]; then
  load_env_file "$BACKEND_DIR/.env" || {
    echo "Error: .env file has invalid syntax."
    exit 1
  }
fi

# Require essential variables.
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

# Optional: validate PIER_INGRESS_DOMAIN if set (DNS name labels only, lowercase, digits, hyphens).
# This check ensures the substitution in the deployment template is safe.
if [[ -n "${PIER_INGRESS_DOMAIN:-}" ]]; then
  if ! [[ "$PIER_INGRESS_DOMAIN" =~ ^[a-z0-9.-]*$ ]]; then
    echo "Error: PIER_INGRESS_DOMAIN \"$PIER_INGRESS_DOMAIN\" contains invalid characters. Use lowercase letters, digits, dots, and hyphens only."
    exit 1
  fi
fi

# Verify kubectl can reach the cluster.
if ! kubectl get nodes > /dev/null 2>&1; then
  echo "Error: kubectl cannot reach the cluster. Check KUBECONFIG."
  exit 1
fi

# Determine TAG: git short SHA with -dirty suffix if tree has changes.
if [[ -z "$TAG" ]]; then
  TAG=$(git -C "$BACKEND_DIR" rev-parse --short HEAD)
  if ! git -C "$BACKEND_DIR" diff-index --quiet HEAD -- 2>/dev/null; then
    TAG="${TAG}-dirty"
  fi
fi

# Build and import image (unless --dry-run).
if [[ $DRY_RUN -eq 0 ]]; then
  echo "==> Building image pier-backend:$TAG"
  docker build -t "pier-backend:$TAG" "$BACKEND_DIR"

  echo "==> Importing image into k3s via SSH"
  docker save "pier-backend:$TAG" | ssh "$K3S_SSH_USER@$K3S_HOST" sudo k3s ctr images import -
fi

# Apply manifests in order.
echo "==> Applying manifests in order"
APPLY_OPTS=""
if [[ $DRY_RUN -eq 1 ]]; then
  APPLY_OPTS="--dry-run=server"
fi

kubectl apply $APPLY_OPTS -f "$BACKEND_DIR/k8s/namespace.yaml"
kubectl apply $APPLY_OPTS -f "$BACKEND_DIR/k8s/rbac.yaml"
kubectl apply $APPLY_OPTS -f "$BACKEND_DIR/k8s/rbac-apps.yaml"

# Apply optional manifests if they exist.
if [[ -f "$BACKEND_DIR/k8s/quota.yaml" ]]; then
  kubectl apply $APPLY_OPTS -f "$BACKEND_DIR/k8s/quota.yaml"
fi
if [[ -f "$BACKEND_DIR/k8s/policy-services.yaml" ]]; then
  kubectl apply $APPLY_OPTS -f "$BACKEND_DIR/k8s/policy-services.yaml"
fi

kubectl apply $APPLY_OPTS -f "$BACKEND_DIR/k8s/service.yaml"

# Create or update Secret with labels (without echoing the token).
echo "==> Creating or updating secret"
kubectl -n default create secret generic pier-backend-secrets \
  --from-literal="PIER_API_TOKEN=$PIER_API_TOKEN" \
  --dry-run=client -o yaml | \
  kubectl label --local -f - \
    app=pier-backend \
    app.kubernetes.io/part-of=pier \
    -o yaml | \
  kubectl apply $APPLY_OPTS -f -

# Compute token SHA256 (never echo it).
TOKEN_SHA256=$(printf '%s' "$PIER_API_TOKEN" | sha256sum | cut -d' ' -f1)

# Render deployment template and apply.
echo "==> Rendering and applying deployment"
sed -e "s|__IMAGE__|pier-backend:$TAG|" \
    -e "s|__TOKEN_SHA256__|$TOKEN_SHA256|" \
    -e "s|__INGRESS_DOMAIN__|${PIER_INGRESS_DOMAIN:-}|" \
    "$BACKEND_DIR/k8s/deployment.yaml.tmpl" | \
  kubectl apply $APPLY_OPTS -f -

# Skip rollout check in --dry-run mode.
if [[ $DRY_RUN -eq 0 ]]; then
  echo "==> Waiting for rollout"
  kubectl -n default rollout status deploy/pier-backend --timeout=120s
fi

echo "==> Deployment successful!"
echo ""
echo "Troubleshooting:"
echo "  kubectl -n default describe pod -l app=pier-backend"
echo "  kubectl -n default logs -l app=pier-backend"
