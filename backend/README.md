# pier backend

TypeScript control-plane API for **pier** (apps dock here). Source lives in `src/**/*.ts`; `dist/` is compiled output for the Docker image only.

Right now: HTTP liveness, cluster connectivity (`/cluster/health`), pod inventory (`/cluster/pods`), and Pier-managed apps (`/apps`). Route docs: `src/routes/README.md`.

## Auth

All routes except `/health` (used by Kubernetes probes) require bearer token authentication with `PIER_API_TOKEN`. Set the token when deploying to non-loopback addresses.

**Generating a token:**
```bash
openssl rand -hex 32
```

**Calling the API with the token:**
```bash
curl -H "Authorization: Bearer $PIER_API_TOKEN" http://localhost:3000/cluster/pods
```

**Development (loopback only):** If `HOST` is `127.0.0.1`, `::1`, or `localhost`, and `PIER_API_TOKEN` is unset, all routes are accessible without authentication. When deploying to a non-loopback address (e.g., `0.0.0.0` in the cluster), `PIER_API_TOKEN` is required and the server will refuse to start without it.

## Run

**Beater (dev)** — settings load from `backend/.env` when present (Node `--env-file-if-exists` on `dev` / `start`). Use an **absolute** path for `KUBECONFIG` (`~` is not expanded in `.env` files). Without a `.env` file, the shell environment is used as today. Defaults to loopback bind (`127.0.0.1`) with auth disabled when no token is set.

```bash
cp .env.example .env   # edit KUBECONFIG to your kubeconfig path
pnpm install
pnpm --dir backend dev # or: pnpm --dir backend start (tsx, no build step)
```

## Deploy to k3s

Run the pier-backend pod in the k3s cluster using its ServiceAccount instead of a kubeconfig on Beater. The deployment script automates the build, import, and rollout.

### Prerequisites

- **Docker**: installed on Beater and able to build images.
- **SSH access**: to k3s node with `ssh-agent` loaded. Verify:
  ```bash
  eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519
  ssh spen@10.0.0.87 'sudo -n k3s ctr version'  # should print OK
  ```
- **`.env` file**: copy `backend/.env.example` to `backend/.env` and fill in the cluster details:
  ```bash
  cp backend/.env.example backend/.env
  # Edit backend/.env:
  #   K3S_HOST=10.0.0.87
  #   K3S_SSH_USER=spen
  #   PIER_API_TOKEN=<generated token>
  ```
- **`kubectl` access**: configured with `KUBECONFIG=/home/spencer/.kube/k3s-node.yaml`.

### Deploy script

```bash
# Build image, import into k3s, apply manifests, and roll out.
# TAG defaults to git short SHA with -dirty suffix if tree has changes.
./backend/scripts/deploy-local.sh

# Or specify a custom tag:
./backend/scripts/deploy-local.sh v1.0
```

The script:

1. **Builds** the Docker image (`docker build -t pier-backend:$TAG backend`)
2. **Imports** the image into k3s containerd via SSH (`docker save | ssh ... k3s ctr images import`)
3. **Applies** manifests in order:
   - `backend/k8s/namespace.yaml` — creates `pier-apps` namespace
   - `backend/k8s/rbac.yaml` — ServiceAccount and ClusterRole for cluster health access
   - `backend/k8s/rbac-apps.yaml` — Role in `pier-apps` for app management
   - `backend/k8s/quota.yaml` (if present) — resource quotas
   - `backend/k8s/policy-services.yaml` (if present) — network policies
   - `backend/k8s/deployment.yaml` — Deployment, Service, and security context
4. **Creates or updates** the `pier-backend-secrets` Secret with `PIER_API_TOKEN` (never echoed to stdout)
5. **Rolls out** the new image with `kubectl set image` and waits for readiness

On failure, the script prints helpful debugging commands:
```bash
kubectl -n default describe pod -l app=pier-backend
kubectl -n default logs -l app=pier-backend
```

### Image versioning

The default tag is the git short SHA. Add `-dirty` if the tree has uncommitted changes. This ensures each rollout is immutable and traceable:

```bash
# Clean tree → e.g., pier-backend:a1b2c3d
# Uncommitted changes → pier-backend:a1b2c3d-dirty
```

The Deployment's `image` field is a placeholder (`pier-backend:dev`); `deploy-local.sh` overrides it with the real tag via `kubectl set image`.

### Pod configuration

- **Security context**: runs as non-root (`node`, uid 1000), read-only root filesystem (`/tmp` is writable), no privilege escalation, all capabilities dropped, runtime default seccomp policy.
- **Resources**: 
  - Requests: `50m` CPU, `96Mi` memory
  - Limits: `500m` CPU, `256Mi` memory
- **PIER_API_TOKEN**: injected from a Secret (not in the manifest or image).
- **ServiceAccount**: `pier-backend` with ClusterRole for `/cluster/health` and Role in `pier-apps` for `/apps`.

### Test from Beater

Port-forward to the pod and verify connectivity and auth:

```bash
# Terminal 1: start port-forward
kubectl -n default port-forward svc/pier-backend 3000:80

# Terminal 2: set the token and test
export PIER_API_TOKEN=<your-token>

# No auth required
curl -s http://localhost:3000/health

# Auth required; these should work:
curl -s -H "Authorization: Bearer $PIER_API_TOKEN" http://localhost:3000/cluster/health
curl -s -H "Authorization: Bearer $PIER_API_TOKEN" http://localhost:3000/apps

# Should fail (401)
curl -s http://localhost:3000/apps
```

### Troubleshooting

**Pod not ready:**
```bash
kubectl -n default describe pod -l app=pier-backend
kubectl -n default logs -l app=pier-backend
```

**Rollback to previous image:**
```bash
kubectl -n default rollout undo deploy/pier-backend
```

**Re-run the deployment script:** it is idempotent. Same tag and image will be a no-op after the rollout succeeds.

## Manifests

Apply manifests in this order using the deploy script (above) or manually:

```bash
kubectl apply -f backend/k8s/namespace.yaml
kubectl apply -f backend/k8s/rbac.yaml
kubectl apply -f backend/k8s/rbac-apps.yaml
kubectl apply -f backend/k8s/deployment.yaml
```

### Verify RBAC

After applying the namespace and RBAC, check that permissions are as expected:

```bash
SA=system:serviceaccount:default:pier-backend

# Should all succeed:
kubectl auth can-i create deployments -n pier-apps --as=$SA       # yes
kubectl auth can-i patch deployments/scale -n pier-apps --as=$SA  # yes
kubectl auth can-i get pods/log -n pier-apps --as=$SA             # yes
kubectl auth can-i create ingresses -n pier-apps --as=$SA         # yes

# Should all fail (403):
kubectl auth can-i delete pods -n pier-apps --as=$SA              # no
kubectl auth can-i create deployments -n default --as=$SA         # no
kubectl auth can-i delete nodes --as=$SA                          # no
```

### Manifest reference

#### `k8s/namespace.yaml`
Creates the `pier-apps` namespace where Pier-managed apps run.

#### `k8s/rbac.yaml`
Three resources:

1. **ServiceAccount `pier-backend`** (namespace `default`)  
   Pod identity. Kubernetes automatically mounts a token at `/var/run/secrets/kubernetes.io/serviceaccount/token`, which `src/k8s/client.ts` uses to authenticate in-cluster API calls.

2. **ClusterRole `pier-backend-cluster-health`**  
   Least-privilege cluster-wide permissions for the `/cluster/health` and `/cluster/pods` routes:
   - `get`, `list` on **nodes** and **pods** (all namespaces)
   - `get` on **`/version`**, **`/healthz`**, **`/livez`**, **`/readyz`** (API discovery/health)

3. **ClusterRoleBinding `pier-backend-cluster-health`**  
   Links the ServiceAccount to the ClusterRole.

Without this file, in-cluster `/cluster/health` returns **403 Forbidden**.

#### `k8s/rbac-apps.yaml`
Namespace-scoped permissions for the `/apps` route (app management in `pier-apps`):

1. **Role `pier-app-manager`** (namespace `pier-apps`)  
   Full CRUD on Deployments, Services, and Ingresses; read-only on Pods and their logs.

2. **RoleBinding `pier-app-manager`**  
   Links the pod's ServiceAccount (from `default`) to the Role (in `pier-apps`).

#### `k8s/deployment.yaml`
Two resources:

1. **Deployment `pier-backend`** (namespace `default`)
   - One replica of the `pier-backend` container.
   - `serviceAccountName: pier-backend` — uses the ServiceAccount from `rbac.yaml`.
   - **Image**: `pier-backend:dev` (placeholder; overridden by `deploy-local.sh`). `imagePullPolicy: IfNotPresent` (local image, not pulled).
   - **Env**:
     - `PORT=3000`, `HOST=0.0.0.0` — listens on all interfaces inside the pod.
     - `PIER_NAMESPACE=pier-apps` — namespace for app queries.
     - `PIER_API_TOKEN` — from a Secret (never in the manifest or image).
   - **Resources**: requests 50m CPU / 96Mi memory; limits 500m CPU / 256Mi memory. Prevents resource-hogging.
   - **Security context** (pod level):
     - `runAsNonRoot: true`, `runAsUser: 1000` — non-root `node` user.
     - `runAsGroup: 1000`, `fsGroup: 1000` — process and file system group.
     - `seccompProfile: { type: RuntimeDefault }` — standard seccomp rules.
   - **Security context** (container level):
     - `allowPrivilegeEscalation: false` — prevents `sudo` or privilege gain.
     - `readOnlyRootFilesystem: true` — filesystem is read-only except `/tmp`.
     - `capabilities: { drop: ["ALL"] }` — all Linux capabilities removed.
   - **Volume `tmp`** (emptyDir): mounted at `/tmp` for app temp files (read-only root requires this).
   - **Probes**:
     - **readinessProbe**: `GET /health` every 10s (initial delay 3s) — Kubernetes considers the pod ready when it passes.
     - **livenessProbe**: `GET /health` every 20s (initial delay 5s) — restarts the pod if it fails.
   - **`revisionHistoryLimit: 3`**: keeps only the last 3 rollout revisions for faster rollback.

2. **Service `pier-backend`** (namespace `default`)
   - Type: ClusterIP (default).
   - Port 80 → pod port 3000 (http).
   - Selector: `app: pier-backend`.
   - Use `kubectl port-forward svc/pier-backend 3000:80` from Beater to test, or set up an Ingress with Traefik (later).

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Process is up (does not call the cluster). Always public. |
| GET | `/cluster/health` | Bearer token | Calls k3s API: server version + node readiness. |
| GET | `/cluster/pods` | Bearer token | Lists all pods (all namespaces) with phase and ready status. |
| GET | `/apps` | Bearer token | Lists Deployments in `PIER_NAMESPACE` labelled `pier.app` (Pier-managed apps only). |

### `GET /apps`

Requires `Authorization: Bearer $PIER_API_TOKEN` (same as other protected routes).

```bash
curl -s -H "Authorization: Bearer $PIER_API_TOKEN" http://localhost:3000/apps
```

Example response:

```json
[
  {
    "name": "hello",
    "image": "nginx:1.27",
    "replicas": 2,
    "ready": 2,
    "status": "running",
    "createdAt": "2026-10-29T15:00:00.000Z"
  }
]
```

An empty namespace returns `[]`. Cluster or RBAC failures return HTTP **503** with `{ "ok": false, "error": "cluster unreachable" }`.

**Status values** (aligned with the frontend `StatusPill`):

| `status` | Meaning |
|----------|---------|
| `running` | All replicas ready and the Deployment has finished its rollout (`ready === replicas`, `updatedReplicas === replicas`, observed generation caught up). |
| `stopped` | `replicas === 0` (scaled down). |
| `building` | Rollout in progress or pods not ready yet. |
| `failed` | Progress deadline exceeded, or `Available=False` while `Progressing` is not `True`. |

Unlabelled Deployments in the namespace are **not** listed (the API selects `labelSelector=pier.app`).

---

## File structure

### Root

| File | Purpose |
|------|---------|
| `package.json` | Package name `pier-backend`, scripts (`dev` / `start` = tsx, `build` = tsup, `start:prod` = node). Uses **pnpm** (`packageManager` field). |
| `pnpm-lock.yaml` | Locked dependency tree (auto-generated). |
| `pnpm-workspace.yaml` | pnpm settings for this package (e.g. `allowBuilds`). |
| `tsconfig.json` | TypeScript settings for `src/` (`strict`, no emit — typecheck only; tsup bundles). |
| `.env.example` | Template for `PORT` (3000), `HOST` (127.0.0.1), `PIER_API_TOKEN`, `PIER_NAMESPACE` (pier-apps), `KUBECONFIG` (absolute path). For deploy: `K3S_HOST` and `K3S_SSH_USER`. Copy to `.env` locally. |
| `.dockerignore` | Excludes `node_modules`, `dist`, `.env*`, `tests`, `k8s`, `scripts`, `*.md`, `.git` from the Docker build context. Keeps images small and excludes secrets. |
| `Dockerfile` | Two-stage build: install + build in stage 1, copy artifacts + pruned deps in stage 2. Runs as non-root `node` (uid 1000) on port 3000. Base image pinned by digest for reproducibility. |
| `README.md` | This file. |

### `src/` — application (TypeScript)

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry: `loadConfig()`, builds Fastify app, listens on `HOST`/`PORT`. |
| `src/shutdown.ts` | One-shot SIGINT/SIGTERM handler with a 10s force-exit if `app.close()` hangs. |
| `src/app.ts` | Creates Fastify instance with logging; registers auth, health, cluster, and apps route plugins. |
| `src/config.ts` | `loadConfig()`: validates `PORT` (1–65535), `HOST` (default 127.0.0.1), optional `PIER_API_TOKEN`, `KUBECONFIG`, `PIER_NAMESPACE` (default `pier-apps`). Refuses non-loopback `HOST` without a token. |
| `src/plugins/auth.ts` | Bearer token authentication hook: requires `Authorization: Bearer <token>` on all routes except `/health`. Skips auth if token is unset (dev mode). |
| `src/routes/README.md` | Route overview, diagrams, and RBAC notes. |
| `src/routes/health.ts` | `GET /health` handler (always public, no auth required). |
| `src/routes/cluster.ts` | `GET /cluster/health` and `GET /cluster/pods` handlers (require auth). Returns generic errors to clients; logs full errors server-side. |
| `src/routes/apps.ts` | `GET /apps` — lists Pier-managed Deployments in `PIER_NAMESPACE`. |
| `src/k8s/README.md` | Index of Kubernetes helper modules. |
| `src/k8s/labels.ts` | Shared `pier.app` / managed-by label helpers. |
| `src/k8s/apps.ts` | Deployment → app mapping, status derivation, `listApps()`. |
| `src/k8s/list-pods.ts` | Maps Kubernetes Pod objects to API summaries. |
| `src/k8s/client.ts` | Loads kube config: **in-cluster** when the pod SA token exists, else **kubeconfig** (`KUBECONFIG` / `~/.kube/config`). |
| `src/k8s/cluster-health.ts` | Calls Kubernetes `Version` + `list Node`; returns version string and ready/total node counts. |

### `dist/` — build output

Generated by `pnpm build`. Do not edit. Used by `pnpm start:prod` and the Docker image.

### `k8s/` — manifests

See [Manifests](#manifests) above for details. Order matters: apply in sequence namespace → rbac → rbac-apps → (quota/policy if present) → deployment.

### `scripts/` — utilities

| File | Purpose |
|------|---------|
| `scripts/deploy-local.sh` | Build, import image to k3s, apply manifests, roll out. See [Deploy to k3s](#deploy-to-k3s). |

## Local vs in-cluster

| Where | How the API reaches k3s |
|-------|-------------------------|
| **Beater** | `KUBECONFIG` in `.env` or shell → mode `kubeconfig` |
| **Pod on k3s** | ServiceAccount token (`/var/run/secrets/kubernetes.io/serviceaccount/token`) → mode `in-cluster` |

The app detects in-cluster mode in `src/k8s/client.ts`: if the token file and `KUBERNETES_SERVICE_HOST` env var are present, it loads the ServiceAccount credentials. Otherwise, it falls back to the `KUBECONFIG` file (on Beater).
