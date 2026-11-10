#!/usr/bin/env bash
# Write k3s registries.yaml so the node can pull images Pier builds to
# localhost:30500 (the pier-system registry NodePort). Idempotent.
#
# Usage: ./scripts/configure-k3s-registry.sh
# Needs K3S_HOST and K3S_SSH_USER (from backend/.env or the environment), same as deploy-local.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
# shellcheck source=SCRIPTDIR/lib/load-env.sh
source "$SCRIPT_DIR/lib/load-env.sh"

die() { echo "Error: $*" >&2; exit 1; }

ENV_FILE="${PIER_ENV_FILE:-$BACKEND_DIR/.env}"
if [[ -f "$ENV_FILE" ]]; then
  load_env_file "$ENV_FILE" || die "$ENV_FILE has invalid syntax."
fi
[[ -n "${K3S_HOST:-}" ]] || die "K3S_HOST not set."
[[ -n "${K3S_SSH_USER:-}" ]] || die "K3S_SSH_USER not set."

REMOTE_FILE=/etc/rancher/k3s/registries.yaml
# HTTP NodePort on the node loopback — matches PIER_BUILD_REGISTRY=localhost:30500.
CONFIG=$(cat <<'YAML'
mirrors:
  "localhost:30500":
    endpoint:
      - "http://127.0.0.1:30500"
configs:
  "localhost:30500":
    tls:
      insecure_skip_verify: true
YAML
)

echo "==> Writing $REMOTE_FILE on ${K3S_SSH_USER}@${K3S_HOST}"
ssh -o BatchMode=yes "${K3S_SSH_USER}@${K3S_HOST}" "sudo tee '$REMOTE_FILE' >/dev/null && sudo systemctl restart k3s" <<<"$CONFIG"
echo "==> Waiting for node Ready"
for _ in $(seq 1 60); do
  if kubectl get nodes --no-headers 2>/dev/null | grep -q ' Ready '; then
    echo "==> k3s is Ready. Pulls from localhost:30500 should work after pier-registry is up."
    exit 0
  fi
  sleep 2
done
die "k3s did not become Ready in time after restart."
