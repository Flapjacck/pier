#!/usr/bin/env bash
# render.sh: render Pier's backend manifests, one at a time, to stdout.
# Sourced by deploy-local.sh. Both the apply path (--dry-run and real deploys)
# and the offline --render path call render_manifest, so they can't drift.
#
# Inputs (set by the caller before calling anything here):
#   K8S_DIR                backend/k8s
#   RENDER_IMAGE           e.g. pier-backend:abc1234
#   RENDER_TOKEN           value written into the Secret (REDACTED in --render)
#   RENDER_TOKEN_SHA256    sha256 of the real token (restart-on-rotate annotation)
#   RENDER_INGRESS_DOMAIN  may be empty
#   RENDER_DASHBOARD_HOST  may be empty; the dashboard ingress is skipped if so
#   RENDER_TLS_ISSUER      may be empty; no tls manifest and no dashboard TLS if so
#   RENDER_TRAEFIK_CONFIG  non-empty to include traefik-config (k3s Traefik settings)

# manifest_names: prints the manifests to apply, in order, one per line.
# Optional files are listed only if they exist; tls only with an issuer; the
# ingress only with a host. data-pvc is required: the Deployment mounts it.
# traefik-config (cluster-wide, kube-system) comes last and only on request.
manifest_names() {
  local name
  for name in namespace rbac rbac-apps storage quota networkpolicies policy-services tls service data-pvc; do
    case "$name" in
      storage | quota | networkpolicies | policy-services)
        [[ -f "$K8S_DIR/$name.yaml" ]] || continue
        ;;
      tls)
        [[ -n "$RENDER_TLS_ISSUER" && -f "$K8S_DIR/$name.yaml" ]] || continue
        ;;
    esac
    echo "$name"
  done
  echo secret
  echo deployment
  if [[ -n "$RENDER_DASHBOARD_HOST" ]]; then
    echo ingress
  fi
  if [[ -n "${RENDER_TRAEFIK_CONFIG:-}" && -f "$K8S_DIR/traefik-config.yaml" ]]; then
    echo traefik-config
  fi
}

# render_secret: Secret default/pier-backend-secrets. The token is fed on
# stdin by the printf builtin, so it never appears in any argv.
render_secret() {
  printf '%s' "$RENDER_TOKEN" |
    kubectl -n default create secret generic pier-backend-secrets \
      --from-file=PIER_API_TOKEN=/dev/stdin \
      --dry-run=client -o yaml |
    kubectl label --local -f - \
      app=pier-backend \
      app.kubernetes.io/part-of=pier \
      -o yaml
}

# render_tls_lines: filters a template on stdin. Lines ending in "# tls-only"
# keep their content (marker stripped) when RENDER_TLS_ISSUER is set, and are
# dropped otherwise.
render_tls_lines() {
  if [[ -n "$RENDER_TLS_ISSUER" ]]; then
    sed -e 's/ *# tls-only$//'
  else
    sed -e '/# tls-only$/d'
  fi
}

# render_manifest <name>: prints one rendered manifest to stdout.
render_manifest() {
  case "$1" in
    secret)
      render_secret
      ;;
    deployment)
      sed -e "s|__IMAGE__|$RENDER_IMAGE|g" \
        -e "s|__TOKEN_SHA256__|$RENDER_TOKEN_SHA256|g" \
        -e "s|__INGRESS_DOMAIN__|$RENDER_INGRESS_DOMAIN|g" \
        -e "s|__DASHBOARD_HOST__|$RENDER_DASHBOARD_HOST|g" \
        -e "s|__TLS_ISSUER__|$RENDER_TLS_ISSUER|g" \
        "$K8S_DIR/deployment.yaml.tmpl"
      ;;
    ingress)
      render_tls_lines <"$K8S_DIR/ingress.yaml.tmpl" |
        sed -e "s|__DASHBOARD_HOST__|$RENDER_DASHBOARD_HOST|g" \
          -e "s|__TLS_ISSUER__|$RENDER_TLS_ISSUER|g"
      ;;
    *)
      cat "$K8S_DIR/$1.yaml"
      ;;
  esac
}

# render_to_dir <dir>: writes every manifest as NNN-<name>.yaml in apply order.
render_to_dir() {
  local dir="$1" i=0 name
  while IFS= read -r name; do
    render_manifest "$name" >"$dir/$(printf '%03d' "$i")-$name.yaml"
    i=$((i + 10))
  done < <(manifest_names)
}

# lint_rendered <dir>: offline checks, no cluster or kubeconfig needed.
# 1. No __PLACEHOLDER__ left behind.
# 2. Every file parses as Kubernetes YAML. `kubectl apply/create --dry-run=client`
#    still calls API discovery, so they can't run offline; `kubectl kustomize`
#    parses every resource without a cluster.
lint_rendered() {
  local dir="$1" status=0 lint_dir f
  if grep -nE '__[A-Z0-9_]+__' "$dir"/*.yaml; then
    echo "Error: unrendered placeholders left in $dir (above)." >&2
    status=1
  fi
  lint_dir="$(mktemp -d)"
  cp "$dir"/*.yaml "$lint_dir/"
  {
    echo "resources:"
    for f in "$dir"/*.yaml; do
      echo "  - $(basename "$f")"
    done
  } >"$lint_dir/kustomization.yaml"
  if ! KUBECONFIG=/dev/null kubectl kustomize "$lint_dir" >/dev/null; then
    echo "Error: rendered manifests failed to parse (kubectl kustomize)." >&2
    status=1
  fi
  rm -rf "$lint_dir"
  return "$status"
}
