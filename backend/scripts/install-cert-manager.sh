#!/usr/bin/env bash
# Install (or upgrade to) the pinned cert-manager release on the cluster.
#
# Usage: ./scripts/install-cert-manager.sh [--dry-run]
#   (no flag)  Download the pinned manifest, verify its sha256, apply it and
#              wait for the cert-manager deployments to roll out.
#   --dry-run  Same download and checks, then kubectl apply --dry-run=server.
#              Nothing on the cluster changes.
#
# The controller gets --enable-certificate-owner-ref=true, so a TLS Secret is
# garbage-collected with its Certificate (and so with its app's Ingress).
# Bump CERT_MANAGER_VERSION and CERT_MANAGER_SHA256 together.

set -euo pipefail

CERT_MANAGER_VERSION="v1.21.3"
CERT_MANAGER_SHA256="c04a51295adda2b1a775146751f973e787190778c7f35180861d9678876e5c74"
CERT_MANAGER_URL="https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"
OWNER_REF_FLAG="--enable-certificate-owner-ref=true"

usage() {
  sed -n '4,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

die() {
  echo "Error: $*" >&2
  exit 1
}

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown argument $1" ;;
  esac
  shift
done

WORK_DIR="$(mktemp -d -t pier-cert-manager.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
MANIFEST="$WORK_DIR/cert-manager.yaml"

echo "==> Downloading cert-manager $CERT_MANAGER_VERSION"
curl -fsSL "$CERT_MANAGER_URL" -o "$MANIFEST"
echo "$CERT_MANAGER_SHA256  $MANIFEST" | sha256sum -c --quiet - ||
  die "checksum mismatch for $CERT_MANAGER_URL"

# Add the owner-ref flag to the controller's args, right after its pinned
# ACME solver image arg (that line exists only in the controller Deployment).
awk -v flag="$OWNER_REF_FLAG" '
  { print }
  /- --acme-http01-solver-image=/ {
    match($0, /^ */)
    printf "%s- %s\n", substr($0, 1, RLENGTH), flag
    added++
  }
  END { if (added != 1) exit 1 }
' "$MANIFEST" >"$MANIFEST.patched" || die "could not add $OWNER_REF_FLAG to the controller args."
mv "$MANIFEST.patched" "$MANIFEST"

kubectl get nodes >/dev/null 2>&1 || die "kubectl cannot reach the cluster. Check KUBECONFIG."

if [[ "$DRY_RUN" == true ]]; then
  # The cert-manager namespace may not exist yet, so a server-side dry run of
  # the namespaced objects can 404; apply the namespace and CRDs first, which
  # is exactly what a real apply validates.
  echo "==> kubectl apply --dry-run=server"
  kubectl apply --dry-run=server -f "$MANIFEST" >/dev/null 2>"$WORK_DIR/err" || {
    if grep -qv 'namespaces "cert-manager" not found' "$WORK_DIR/err"; then
      cat "$WORK_DIR/err" >&2
      die "server-side dry run failed."
    fi
    echo "    (namespaced objects skipped: the cert-manager namespace doesn't exist yet)"
  }
  echo "==> Dry run OK. Nothing was changed."
  exit 0
fi

echo "==> Applying cert-manager $CERT_MANAGER_VERSION"
kubectl apply -f "$MANIFEST"

echo "==> Waiting for rollout"
for deploy in cert-manager cert-manager-cainjector cert-manager-webhook; do
  kubectl -n cert-manager rollout status "deploy/$deploy" --timeout=180s
done

echo "==> cert-manager $CERT_MANAGER_VERSION is ready."
echo "Next: set PIER_TLS_ISSUER=pier-ca in backend/.env and run ./scripts/deploy-local.sh"
