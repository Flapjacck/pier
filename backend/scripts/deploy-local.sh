#!/usr/bin/env bash
# Deploy pier-backend to k3s: build image, import into containerd, apply manifests, roll out.
#
# Usage: ./scripts/deploy-local.sh [--dry-run | --render [--out DIR]] [TAG]
#   (no flag)  Build, import over SSH, apply every manifest, wait for rollout.
#   --dry-run  Server-side check: kubectl apply --dry-run=server. Needs the
#              cluster, but no docker build and no SSH.
#   --render   Offline: render every manifest into DIR (default: a new temp dir)
#              and lint them. No cluster, SSH, docker or token needed; the
#              Secret is rendered with a REDACTED value.
#   TAG        Image tag. Defaults to the git short SHA, plus -dirty if tracked
#              files have uncommitted changes.

set -euo pipefail

# Resolve directories from script location so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BACKEND_DIR")"
K8S_DIR="$BACKEND_DIR/k8s"

# shellcheck source=SCRIPTDIR/lib/load-env.sh
source "$SCRIPT_DIR/lib/load-env.sh"
# shellcheck source=SCRIPTDIR/lib/render.sh
source "$SCRIPT_DIR/lib/render.sh"

usage() {
  sed -n '4,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

die() {
  echo "Error: $*" >&2
  exit 1
}

# Parse flags and TAG argument.
MODE=deploy
OUT_DIR=""
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run | --render)
      [[ "$MODE" == deploy ]] || die "use only one of --dry-run and --render."
      MODE="${1#--}"
      shift
      ;;
    --out)
      [[ $# -ge 2 ]] || die "--out needs a directory."
      OUT_DIR="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      usage >&2
      die "unknown flag $1"
      ;;
    *)
      [[ -z "$TAG" ]] || die "only one TAG allowed (got \"$TAG\" and \"$1\")."
      TAG="$1"
      shift
      ;;
  esac
done
if [[ -n "$OUT_DIR" && "$MODE" != render ]]; then
  die "--out only works with --render."
fi

# Load environment for K3S_HOST, K3S_SSH_USER, PIER_API_TOKEN, PIER_INGRESS_DOMAIN, PIER_TLS_ISSUER.
# Values already in the environment win. PIER_ENV_FILE overrides the path
# (tests point it at a file that doesn't exist).
ENV_FILE="${PIER_ENV_FILE:-$BACKEND_DIR/.env}"
if [[ -f "$ENV_FILE" ]]; then
  load_env_file "$ENV_FILE" || die "$ENV_FILE has invalid syntax."
fi

# Require what each mode needs. --render needs none of these.
require() {
  [[ -n "${!1:-}" ]] || die "$1 not set. Set it in backend/.env or as an environment variable."
}
if [[ "$MODE" == deploy ]]; then
  require K3S_HOST
  require K3S_SSH_USER
fi
if [[ "$MODE" != render ]]; then
  require PIER_API_TOKEN
fi

# Values below are substituted into templates with sed, so keep them to safe
# DNS/tag characters (no |, &, / or newlines).
DASHBOARD_HOST="${PIER_DASHBOARD_HOST:-}"
if [[ -z "$DASHBOARD_HOST" && -n "${PIER_INGRESS_DOMAIN:-}" ]]; then
  DASHBOARD_HOST="pier.${PIER_INGRESS_DOMAIN}"
fi
TLS_ISSUER="${PIER_TLS_ISSUER:-}"
for var in PIER_INGRESS_DOMAIN DASHBOARD_HOST TLS_ISSUER; do
  if ! [[ "${!var:-}" =~ ^[a-z0-9.-]*$ ]]; then
    die "$var \"${!var}\" contains invalid characters. Use lowercase letters, digits, dots, and hyphens only."
  fi
done

# Determine TAG: git short SHA with -dirty suffix if tree has changes.
if [[ -z "$TAG" ]]; then
  TAG=$(git -C "$BACKEND_DIR" rev-parse --short HEAD)
  if ! git -C "$BACKEND_DIR" diff-index --quiet HEAD -- 2>/dev/null; then
    TAG="${TAG}-dirty"
  fi
fi
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || die "TAG \"$TAG\" may only use letters, digits, '.', '_' and '-'."

# Inputs for lib/render.sh. The sha256 is safe to pass around; the token never is.
RENDER_IMAGE="pier-backend:$TAG"
RENDER_INGRESS_DOMAIN="${PIER_INGRESS_DOMAIN:-}"
RENDER_DASHBOARD_HOST="$DASHBOARD_HOST"
RENDER_TLS_ISSUER="$TLS_ISSUER"
RENDER_TRAEFIK_CONFIG=""
if [[ "$MODE" == render ]]; then
  RENDER_TRAEFIK_CONFIG=1
  RENDER_TOKEN="REDACTED"
else
  RENDER_TOKEN="$PIER_API_TOKEN"
fi
RENDER_TOKEN_SHA256=$(printf '%s' "${PIER_API_TOKEN:-$RENDER_TOKEN}" | sha256sum | cut -d' ' -f1)

# --render: write to a directory, lint, and stop. No cluster access at all.
if [[ "$MODE" == render ]]; then
  if [[ -z "$OUT_DIR" ]]; then
    OUT_DIR="$(mktemp -d -t pier-render.XXXXXX)"
  fi
  mkdir -p "$OUT_DIR"
  # Clear earlier renders (NNN- since #29, NN- before) so lint only sees this run.
  rm -f "$OUT_DIR"/[0-9][0-9]-*.yaml "$OUT_DIR"/[0-9][0-9][0-9]-*.yaml
  echo "==> Rendering manifests for $RENDER_IMAGE into $OUT_DIR"
  render_to_dir "$OUT_DIR"
  ls -1 "$OUT_DIR"
  echo "==> Linting rendered manifests (offline)"
  lint_rendered "$OUT_DIR" || die "lint failed."
  echo "==> Render OK: $OUT_DIR"
  exit 0
fi

# Verify kubectl can reach the cluster.
kubectl get nodes >/dev/null 2>&1 || die "kubectl cannot reach the cluster. Check KUBECONFIG."

# TLS needs cert-manager's CRDs before tls.yaml can apply (or dry-run).
if [[ -n "$TLS_ISSUER" ]] && ! kubectl get crd clusterissuers.cert-manager.io >/dev/null 2>&1; then
  die "PIER_TLS_ISSUER is set but cert-manager isn't installed. Run ./scripts/install-cert-manager.sh first."
fi

# k3s Traefik settings (k8s/traefik-config.yaml: client source IP). Rendered always;
# applied only on k3s, unless opted out or someone else's traefik HelmChartConfig exists.
RENDER_TRAEFIK_CONFIG=""
if [[ "${PIER_TRAEFIK_CONFIG:-true}" == false ]]; then
  echo "==> Skipping traefik-config (PIER_TRAEFIK_CONFIG=false)"
elif ! kubectl get crd helmchartconfigs.helm.cattle.io >/dev/null 2>&1; then
  echo "==> Skipping traefik-config (not a k3s cluster: no HelmChartConfig CRD)"
elif kubectl -n kube-system get helmchartconfig traefik >/dev/null 2>&1 &&
  [[ "$(kubectl -n kube-system get helmchartconfig traefik -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}')" != pier ]]; then
  echo "==> Skipping traefik-config: kube-system/traefik HelmChartConfig exists and isn't Pier's; merge k8s/traefik-config.yaml into it by hand"
else
  RENDER_TRAEFIK_CONFIG=1
fi

# Build and import image (real deploys only).
if [[ "$MODE" == deploy ]]; then
  echo "==> Building image $RENDER_IMAGE"
  docker build -f "$BACKEND_DIR/Dockerfile" -t "$RENDER_IMAGE" "$REPO_ROOT"

  echo "==> Importing image into k3s via SSH"
  docker save "$RENDER_IMAGE" | ssh "$K3S_SSH_USER@$K3S_HOST" sudo k3s ctr images import -
fi

APPLY_OPTS=()
if [[ "$MODE" == dry-run ]]; then
  APPLY_OPTS=(--dry-run=server)
fi

# Apply every manifest in order (see k8s/README.md#apply-order), piping each
# straight from the renderer so the Secret never touches disk.
echo "==> Applying manifests in order"
# Server dry-run does not persist a Namespace create, so namespaced objects in a
# brand-new pier-system fail with NotFound. Fall back to client dry-run for those
# until the namespace exists on the cluster (first real deploy creates it).
while IFS= read -r name; do
  echo "--> $name"
  opts=("${APPLY_OPTS[@]}")
  if [[ "$MODE" == dry-run && ( "$name" == rbac-builds || "$name" == registry ) ]] &&
    ! kubectl get namespace pier-system >/dev/null 2>&1; then
    echo "    (pier-system not on cluster yet; client dry-run for this manifest)"
    opts=(--dry-run=client)
  fi
  render_manifest "$name" | kubectl apply "${opts[@]}" -f -
done < <(manifest_names)
if [[ -z "$DASHBOARD_HOST" ]]; then
  echo "==> Skipped dashboard ingress (PIER_DASHBOARD_HOST and PIER_INGRESS_DOMAIN not set)"
fi

if [[ "$MODE" == dry-run ]]; then
  echo "==> Dry run OK (server-side). Nothing was changed."
  exit 0
fi

echo "==> Waiting for rollout"
kubectl -n default rollout status deploy/pier-backend --timeout=120s

echo "==> Deployment successful!"
echo ""
if [[ -n "$DASHBOARD_HOST" ]]; then
  echo "Dashboard: http${TLS_ISSUER:+s}://$DASHBOARD_HOST"
  echo ""
fi
echo "Troubleshooting:"
echo "  kubectl -n default describe pod -l app=pier-backend"
echo "  kubectl -n default logs -l app=pier-backend"
