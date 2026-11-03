# Kubernetes manifests

Manifests for the `pier-backend` pod (namespace `default`) and the guard rails on `pier-apps`, the namespace where Pier-deployed apps run. The cluster is a single k3s node: 4 CPU, about 9.2Gi allocatable memory, Traefik ingress and ServiceLB.

## Files

| File | Objects |
|------|---------|
| [namespace.yaml](namespace.yaml) | Namespace `pier-apps`, with Pod Security labels: enforce `baseline`, warn and audit `restricted`, all at version `latest`. |
| [rbac.yaml](rbac.yaml) | ServiceAccount `default/pier-backend`; ClusterRole and ClusterRoleBinding `pier-backend-cluster-health`. |
| [rbac-apps.yaml](rbac-apps.yaml) | Role and RoleBinding `pier-app-manager` in `pier-apps`, bound to `default/pier-backend`. |
| [quota.yaml](quota.yaml) | ResourceQuota `pier-apps-quota` and LimitRange `pier-apps-limits` in `pier-apps` (optional, applied if present). |
| [networkpolicies.yaml](networkpolicies.yaml) | Four NetworkPolicies in `pier-apps`: default-deny, allow-ingress-from-traefik, allow-dns-egress, allow-internet-egress (optional, applied if present). |
| [policy-services.yaml](policy-services.yaml) | ValidatingAdmissionPolicy and binding `pier-apps-clusterip-only`. Only Services of type ClusterIP are admitted in `pier-apps` (optional, applied if present). |
| [tls.yaml](tls.yaml) | cert-manager ClusterIssuers `pier-selfsigned` and `pier-ca`, the root Certificate `cert-manager/pier-root-ca`, and the Traefik Middleware `pier-https-redirect` in `pier-apps` and `default`. Applied only when `PIER_TLS_ISSUER` is set; needs cert-manager (see [TLS](#tls)). |
| [service.yaml](service.yaml) | ClusterIP Service `pier-backend` in `default`. |
| [deployment.yaml.tmpl](deployment.yaml.tmpl) | Deployment `pier-backend` in `default` (template; rendered with `__IMAGE__`, `__TOKEN_SHA256__`, `__INGRESS_DOMAIN__`, `__DASHBOARD_HOST__`, `__TLS_ISSUER__`). |
| [ingress.yaml.tmpl](ingress.yaml.tmpl) | Ingress `pier-backend-dashboard` for the dashboard (template; rendered with `__DASHBOARD_HOST__` and `__TLS_ISSUER__`; lines ending in `# tls-only` are kept only when `PIER_TLS_ISSUER` is set; applied only if dashboard host is set). |

## Apply order

`../scripts/deploy-local.sh` applies manifests and templates in this order (see [backend README deploy section](../README.md#deploy-to-k3s)):

1. `namespace.yaml` — creates `pier-apps` namespace with Pod Security labels
2. `rbac.yaml` — ServiceAccount and ClusterRole for cluster health check
3. `rbac-apps.yaml` — Role for app management in `pier-apps`
4. **Optional:** `quota.yaml` (if present) — ResourceQuota and LimitRange in `pier-apps`
5. **Optional:** `networkpolicies.yaml` (if present) — Network isolation policies
6. **Optional:** `policy-services.yaml` (if present) — Service type admission policy
7. **Optional:** `tls.yaml` (only when `PIER_TLS_ISSUER` is set) — CA issuers and HTTPS redirect Middlewares. The script stops early if cert-manager's CRDs are missing.
8. `service.yaml` — Service for pier-backend
9. **Generated:** Secret `default/pier-backend-secrets` from `PIER_API_TOKEN` (piped on stdin, never in argv or on disk)
10. **Rendered:** `deployment.yaml.tmpl` — Deployment with substitutions:
   - `__IMAGE__` → `pier-backend:$TAG` (the built image)
   - `__TOKEN_SHA256__` → SHA256 hash of `PIER_API_TOKEN` (for restart detection)
   - `__INGRESS_DOMAIN__` → `PIER_INGRESS_DOMAIN` env var
   - `__DASHBOARD_HOST__` → `PIER_DASHBOARD_HOST` or derived value
   - `__TLS_ISSUER__` → `PIER_TLS_ISSUER` (empty when TLS is off)
11. **Conditionally rendered:** `ingress.yaml.tmpl` — Dashboard ingress (only if a dashboard host is set: `PIER_DASHBOARD_HOST`, or `pier.<PIER_INGRESS_DOMAIN>`), rendered with `__DASHBOARD_HOST__`. With TLS on it also gets the cert-manager issuer annotation, the redirect Middleware and a `tls` block (Secret `pier-backend-tls`).

Namespace and RBAC must exist before namespaced objects.

To check changes here without touching the cluster:

- `../scripts/deploy-local.sh --render [--out DIR]` renders every manifest in this order to `DIR` as `NNN-<name>.yaml` (Secret value `REDACTED`) and lints them offline. Needs only `kubectl` on PATH, no cluster, SSH or token.
- `../scripts/deploy-local.sh --dry-run` sends the same manifests to the API server with `kubectl apply --dry-run=server` (admission and RBAC checks, nothing changed).

## TLS

TLS is opt-in. With `PIER_TLS_ISSUER` set, every Ingress Pier creates (apps and the dashboard) asks cert-manager for a certificate, Traefik terminates HTTPS on `websecure`, and plain HTTP gets a permanent redirect to HTTPS through the `pier-https-redirect` Middleware.

**Why a private CA.** The default ingress domain is a `nip.io` name on a LAN IP, which Let's Encrypt can't validate (HTTP-01 needs the node reachable from the internet, and DNS-01 needs a zone you control). So `tls.yaml` sets up a small CA inside the cluster: a self-signed ClusterIssuer mints a 10-year root (`cert-manager/pier-root-ca`, ECDSA P-256), and the `pier-ca` ClusterIssuer signs every app certificate with it. Browsers trust those once you trust the root.

**Setup, once per cluster:**

```bash
cd backend
./scripts/install-cert-manager.sh --dry-run   # server-side check, changes nothing
./scripts/install-cert-manager.sh             # pinned, checksum-verified cert-manager
echo 'PIER_TLS_ISSUER=pier-ca' >> .env
ssh-add && ./scripts/deploy-local.sh          # applies tls.yaml and the TLS dashboard ingress
```

`install-cert-manager.sh` pins a cert-manager release, verifies its sha256, and adds `--enable-certificate-owner-ref=true` to the controller. That makes each certificate Secret owned by its Certificate, which is owned (through cert-manager's ingress-shim) by the Ingress, which is owned by the app Deployment. Deleting an app therefore garbage-collects its `<name>-tls` Secret too, and the backend needs no new RBAC.

**Trust the root CA** on each machine that opens the dashboard or apps:

```bash
kubectl -n cert-manager get secret pier-root-ca -o jsonpath='{.data.ca\.crt}' | base64 -d > pier-root-ca.crt
# Linux Mint / Ubuntu:
sudo cp pier-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
# Firefox keeps its own store: Settings, Privacy & Security, Certificates, View Certificates, Authorities, Import.
```

Keep the root private: anyone with the `pier-root-ca` Secret can mint certificates your machines will trust.

**Check it:**

```bash
kubectl get clusterissuer pier-ca                  # READY True
kubectl -n pier-apps get certificate               # one per app, READY True
curl -sI http://<app>.<domain>                     # 301 to https://
curl -sI --cacert pier-root-ca.crt https://<app>.<domain>   # 200
```

**Public domain instead.** If the ingress domain is public and the node is reachable on port 80, create a Let's Encrypt ACME ClusterIssuer (for example `letsencrypt-prod`) and set `PIER_TLS_ISSUER` to its name; nothing else changes. The CA issuers in `tls.yaml` can stay.

**Turning it off.** Unset `PIER_TLS_ISSUER` and redeploy. New apps get HTTP-only Ingresses; existing ones keep their `tls` block until they're recreated. The API reports each app's URL from its live Ingress, so old and new apps both show the right scheme.

**NetworkPolicies are unchanged.** TLS ends at Traefik, which already reaches apps on their plain HTTP port, and the CA issuer needs no ACME solver pods in `pier-apps`. A Let's Encrypt HTTP-01 issuer would need an ingress allowance for its solver pods.

## RBAC

| Subject | Scope | Grants |
|---------|-------|--------|
| `pier-backend-cluster-health` (ClusterRole) | cluster | `get`/`list` on `nodes`; `get` on `/version`, `/healthz`, `/livez`, `/readyz`. |
| `pier-app-manager` (Role) | `pier-apps` | Only what the backend calls (see the comments in [rbac-apps.yaml](rbac-apps.yaml)), below. |

`pier-app-manager` verbs:

| Resource | Verbs | Used by |
|----------|-------|---------|
| `deployments` | `get`, `list`, `create`, `patch`, `delete` | lookup, `GET /apps`, create, restart and settings (JSON patch), delete and create rollback |
| `deployments/scale` | `update` | scale (`replaceNamespacedDeploymentScale` is a PUT) |
| `services` | `get`, `create`, `patch`, `delete` | create, delete, settings (port change patches `targetPort`) |
| `resourcequotas`, `limitranges` | `list` | quota/limit pre-check on create with `resources` and on `PATCH /apps/:name` |
| `pods` | `list` | app pods and the cluster pods route |
| `pods/log` | `get` | logs and live logs (`follow` is still a `get`) |
| `ingresses` | `get`, `list`, `create`, `delete` | lookup, host conflict check, create, delete |

No `watch` (there are no watches or informers) and no `update` on whole objects (nothing PUTs a Deployment, Service or Ingress). If you add a k8s call, add its verb here and in `rbac-apps.yaml`.

Check what it allows:

```bash
SA=system:serviceaccount:default:pier-backend
kubectl auth can-i create deployments -n pier-apps --as=$SA        # yes
kubectl auth can-i update deployments/scale -n pier-apps --as=$SA  # yes
kubectl auth can-i list pods -n pier-apps --as=$SA                 # yes
kubectl auth can-i get pods/log -n pier-apps --as=$SA              # yes
kubectl auth can-i create ingresses -n pier-apps --as=$SA          # yes
kubectl auth can-i watch deployments -n pier-apps --as=$SA         # no
kubectl auth can-i list resourcequotas -n pier-apps --as=$SA       # yes
kubectl auth can-i update services -n pier-apps --as=$SA           # no
kubectl auth can-i get pods -n pier-apps --as=$SA                  # no
kubectl auth can-i delete pods -n pier-apps --as=$SA               # no
kubectl auth can-i create deployments -n default --as=$SA         # no
kubectl auth can-i delete nodes --as=$SA                          # no
```

## Pod Security (`pier-apps`)

**Enforced: baseline.** Pods that need host access or extra privilege are rejected:
- `privileged: true`
- `hostNetwork`, `hostPID`, `hostIPC` or `hostPort`
- `hostPath` volumes
- Adding capabilities beyond the default set, e.g. `NET_RAW` or `SYS_ADMIN`
- `seccompProfile: Unconfined`, custom SELinux types, non-default `procMount`, unsafe sysctls

Baseline still allows root containers, so images like `nginx:1.27` run unmodified.

**Warned and audited: restricted.** Violations are allowed but show up as `kubectl` warnings and audit annotations:
- `runAsNonRoot: true`, and no `runAsUser: 0`
- `allowPrivilegeEscalation: false`
- `capabilities.drop: ["ALL"]`; only `NET_BIND_SERVICE` may be added back
- `seccompProfile.type: RuntimeDefault` or `Localhost`
- Only restricted volume types (configMap, secret, emptyDir, projected, PVC, etc.)

The plan is to switch `enforce` to `restricted` once app manifests are hardened.

## Quota and limits (`pier-apps`)

The ResourceQuota is a ceiling on the namespace's total, not a reservation. Nothing is set aside for `pier-apps`. It stops apps from taking more than this share of the node. `pier-backend` and the k3s system pods run in other namespaces and aren't counted.

| ResourceQuota | Value | Why |
|---------------|-------|-----|
| `requests.cpu` / `limits.cpu` | 2 / 4 | Apps can request at most half the node's 4 CPU; their limits can add up to all 4. |
| `requests.memory` / `limits.memory` | 4Gi / 6Gi | Leaves room on about 9.2Gi for k3s and the backend. |
| `requests.ephemeral-storage` / `limits.ephemeral-storage` | 5Gi / 10Gi | Node allocatable ~44.6Gi; apps use at most 5Gi request / 10Gi limit, leaving room for k3s system pods. |
| `pods` | 20 | Stops runaway replica counts. |
| `services` | 20 | |
| `services.nodeports` | 0 | No node ports. The Service-type policy blocks these as well. |
| `services.loadbalancers` | 0 | No ServiceLB. The Service-type policy blocks these as well. |
| `count/ingresses.networking.k8s.io` | 20 | Max 20 ingress routes; usually one per app with some headroom. |
| `persistentvolumeclaims` | 0 | No persistent storage yet. |

Because `requests.*` and `limits.*` are in the quota, every container needs them. The LimitRange (type `Container`) fills them in when a container doesn't set them:

| LimitRange | CPU | Memory | Ephemeral-Storage |
|------------|-----|--------|-------------------|
| `defaultRequest` | 50m | 64Mi | 64Mi |
| `default` (limit) | 500m | 256Mi | 1Gi |
| `max` per container | 2 | 2Gi | 2Gi |

```bash
kubectl describe resourcequota pier-apps-quota -n pier-apps
kubectl describe limitrange pier-apps-limits -n pier-apps
```

Pier sets explicit CPU/memory on every app (defaults match the LimitRange defaults; apps can pick others). Quotas only bite at pod admission, so the backend pre-checks them before creating or patching an app and returns `403 quota exceeded` instead of leaving pods stuck. The Settings tab caps limits at the LimitRange max (2 CPU / 2Gi).

## Service type policy (`pier-apps`)

`pier-apps-clusterip-only` (`failurePolicy: Fail`, action `Deny`) runs on every Service CREATE and UPDATE in `pier-apps`. It admits a Service only if `spec.type` is unset or `ClusterIP`.

| Type | Blocked by |
|------|------------|
| `NodePort` | the policy **and** the quota (`services.nodeports: 0`) |
| `LoadBalancer` | the policy **and** the quota (`services.loadbalancers: 0`) |
| `ExternalName` | the policy only |

Why block them:
- On k3s, a NodePort Service is opened on every node IP by kube-proxy.
- A LoadBalancer Service is also published on the node IP by ServiceLB (`svclb-*` pods), which puts the app straight onto the LAN.
- An ExternalName Service is a DNS alias, which can point cluster-internal names at arbitrary hosts.

For external access, use an Ingress through Traefik (the Role can create Ingresses; `POST /apps` support is [#4](https://github.com/Flapjacck/pier/issues/4)). For testing, use `kubectl port-forward`.

## Network isolation (`pier-apps`)

Four NetworkPolicies enforce network segmentation:

| Policy | Effect |
|--------|--------|
| `default-deny` | Blocks all ingress and egress by default. Apps must explicitly allow needed traffic. |
| `allow-ingress-from-traefik` | Allows ingress from Traefik pod (`app.kubernetes.io/name=traefik` in `kube-system`) to all app pods, enabling HTTP/HTTPS access via the ingress controller. |
| `allow-dns-egress` | Allows egress from app pods to kube-dns (`k8s-app=kube-dns` in `kube-system`) on TCP/UDP 53, enabling service name and external domain resolution. |
| `allow-internet-egress` | Allows outbound HTTP/HTTPS (TCP 80/443, UDP 443 for QUIC) to public addresses (`0.0.0.0/0`), but blocks RFC1918 private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and shared address space CGNAT (`100.64.0.0/10`). Prevents app-to-app communication, access to pier-backend in `default`, and LAN address access. |

**Blocked by design:** Other app pods, pier-backend, and LAN/private networks.

**Optional: Widening egress rules**

To allow an app to reach a specific private network or additional port, add a custom NetworkPolicy in `pier-apps`. Examples:

- **App-to-app communication:** add an egress rule from app-a's pod selector to app-b's pod selector (egress, no ingress needed due to stateful firewall)
- **Private LAN access (e.g., database):** add egress to a specific CIDR and port(s), e.g. `10.0.5.0/24:5432` for a database
- **Extra port to public internet:** add egress on a non-standard port (e.g. TCP 8080) to `0.0.0.0/0`

See `networkpolicies.yaml` for commented examples. Apps communicate only through public internet (ingress/egress) or explicit private rules, never directly via LAN discovery.

```bash
kubectl get netpol -n pier-apps
kubectl describe netpol -n pier-apps
```

Testing app network connectivity (busybox gets LimitRange defaults):

```bash
# DNS resolution works
kubectl run t -n pier-apps --rm -i --image=busybox:1.36 --restart=Never -- nslookup kubernetes.default

# Other apps are blocked (timeout)
kubectl run t -n pier-apps --rm -i --image=busybox:1.36 --restart=Never -- wget -T 3 -qO- http://app-name.pier-apps.svc

# pier-backend is blocked (timeout)
kubectl run t -n pier-apps --rm -i --image=busybox:1.36 --restart=Never -- wget -T 3 -qO- http://pier-backend.default.svc/health

# LAN/private networks are blocked (timeout; use node IP or router IP)
kubectl run t -n pier-apps --rm -i --image=busybox:1.36 --restart=Never -- wget -T 3 -qO- http://<lan-ip>

# Public internet works
kubectl run t -n pier-apps --rm -i --image=busybox:1.36 --restart=Never -- wget -T 5 -qO- https://example.com
```

## Writing manifests for `pier-apps`

A Deployment that passes baseline and the quota without restricted warnings:

```yaml
spec:
  template:
    spec:
      automountServiceAccountToken: false   # apps don't call the Kubernetes API
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: example/app:1.0            # must run as a non-root user
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { cpu: 500m, memory: 256Mi }
```

Pair it with a Service that leaves out `type` or sets `type: ClusterIP`. Check a manifest against admission before applying it:

```bash
kubectl apply --dry-run=server -f my-app.yaml
```

## Debugging rejected apps

A Deployment is accepted even when its pods aren't. Pod Security and quota rejections show up as `FailedCreate` events on the ReplicaSet. No pods appear, and `/apps` reports the app as `building`. It becomes `failed` once the progress deadline passes. Services are rejected straight away, when they are created.

```bash
kubectl get events -n pier-apps --sort-by=.lastTimestamp
kubectl describe rs -n pier-apps
kubectl describe pod -n pier-apps
```

| Message contains | Cause | Fix |
|------------------|-------|-----|
| `violates PodSecurity "baseline:latest": privileged` | `securityContext.privileged: true` | Remove it. If the app truly needs a privileged container, it can't run in `pier-apps`. |
| `violates PodSecurity "baseline:latest": hostPath volumes` | A `hostPath` volume | Use `emptyDir` (PVCs are capped at 0 for now). |
| `violates PodSecurity "baseline:latest": host namespaces` | `hostNetwork`, `hostPID` or `hostIPC` | Remove it. |
| `violates PodSecurity "baseline:latest": non-default capabilities` | `capabilities.add` beyond the default set | Drop the extra capabilities. |
| `exceeded quota: pier-apps-quota` | The namespace total would go over a quota line | Lower requests, limits or replicas, or remove other apps. |
| `maximum cpu usage per Container` / `maximum memory usage per Container` | A container is over the LimitRange `max` | Keep each container at 2 CPU / 2Gi or below. |
| `maximum ephemeral-storage usage per Container` | A container is over the LimitRange `max` (2Gi) | Reduce ephemeral storage: use smaller base images, build more efficiently, or add emptyDir mounts as needed. The quota is 5Gi request / 10Gi limit per namespace. |
| App pod connection times out to another pod, pier-backend, or LAN address | NetworkPolicy `default-deny` or `allow-internet-egress` blocks private addresses | Check `kubectl describe netpol -n pier-apps` to confirm. Apps can only reach ingress via Traefik, DNS, and public internet. |
| `Services in pier-apps must be type ClusterIP` | Service type NodePort, LoadBalancer or ExternalName | Leave out `type` or use `ClusterIP`. |
