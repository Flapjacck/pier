# pier backend

TypeScript control-plane API for **pier** (apps dock here). Source lives in `src/**/*.ts`; `dist/` is compiled output for the Docker image only.

Right now: HTTP liveness, cluster connectivity (`/cluster/health`), and pod inventory (`/cluster/pods`). Route docs: `src/routes/README.md`.

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

**Production image**

```bash
pnpm build           # tsup → dist/
docker build -t pier-backend:dev .
```

**In the cluster** — `HOST` is set to `0.0.0.0` (see `k8s/deployment.yaml:29-30`). The API requires `PIER_API_TOKEN` to be injected as an environment variable or secret; see issue #7. For now, testing in the cluster assumes a placeholder token.

## Deploy manifests

Apply manifests in this order:

```bash
# 1. Create pier-apps namespace
kubectl apply -f backend/k8s/namespace.yaml

# 2. Set up RBAC: cluster-wide health access + namespaced app management
kubectl apply -f backend/k8s/rbac.yaml
kubectl apply -f backend/k8s/rbac-apps.yaml

# 3. Deploy the backend service and pod
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

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Process is up (does not call the cluster). Always public. |
| GET | `/cluster/health` | Bearer token | Calls k3s API: server version + node readiness. |
| GET | `/cluster/pods` | Bearer token | Lists all pods (all namespaces) with phase and ready status. |

---

## Every file in `backend/`

### Root

| File | Purpose |
|------|---------|
| `package.json` | Package name `pier-backend`, scripts (`dev` / `start` = tsx, `build` = tsup, `start:prod` = node). Uses **pnpm** (`packageManager` field). |
| `pnpm-lock.yaml` | Locked dependency tree (auto-generated). |
| `pnpm-workspace.yaml` | pnpm settings for this package (e.g. `allowBuilds`). |
| `tsconfig.json` | TypeScript settings for `src/` (`strict`, no emit — typecheck only; tsup bundles). |
| `.env.example` | Template for `PORT` (3000), `HOST` (127.0.0.1), `PIER_API_TOKEN` (leave empty for dev on loopback), `PIER_NAMESPACE` (pier-apps), and `KUBECONFIG` (absolute path). Copy to `.env` locally. |
| `Dockerfile` | Multi-stage image: `pnpm install`, `pnpm build`, run as non-root `node` on port 3000. |
| `README.md` | This file. |

### `src/` — application (TypeScript)

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry: `loadConfig()`, builds Fastify app, listens on `HOST`/`PORT`. |
| `src/shutdown.ts` | One-shot SIGINT/SIGTERM handler with a 10s force-exit if `app.close()` hangs. |
| `src/app.ts` | Creates Fastify instance with logging; registers auth, health, and cluster route plugins. |
| `src/config.ts` | `loadConfig()`: validates `PORT` (1–65535), `HOST` (default 127.0.0.1), optional `PIER_API_TOKEN`, `KUBECONFIG`, `PIER_NAMESPACE` (default `pier-apps`). Refuses non-loopback `HOST` without a token. |
| `src/plugins/auth.ts` | Bearer token authentication hook: requires `Authorization: Bearer <token>` on all routes except `/health`. Skips auth if token is unset (dev mode). |
| `src/routes/README.md` | Route overview, diagrams, and RBAC notes. |
| `src/routes/health.ts` | `GET /health` handler (always public, no auth required). |
| `src/routes/cluster.ts` | `GET /cluster/health` and `GET /cluster/pods` handlers (require auth). Returns generic errors to clients; logs full errors server-side. |
| `src/k8s/list-pods.ts` | Maps Kubernetes Pod objects to API summaries. |
| `src/k8s/client.ts` | Loads kube config: **in-cluster** when the pod SA token exists, else **kubeconfig** (`KUBECONFIG` / `~/.kube/config`). |
| `src/k8s/cluster-health.ts` | Calls Kubernetes `Version` + `list Node`; returns version string and ready/total node counts. |

### `dist/` — build output

Generated by `pnpm build`. Do not edit. Used by `pnpm start:prod` and the Docker image.

### `k8s/` — manifests for running **on** the cluster

Apply with `kubectl apply -f k8s/`. Order: RBAC first, then Deployment (which includes a Service).

#### `k8s/rbac.yaml` (three resources)

1. **ServiceAccount `pier-backend`** (namespace `default`)  
   Identity for the pod. Kubernetes mounts a token at `/var/run/secrets/kubernetes.io/serviceaccount/` so the app can call the API in-cluster.

2. **ClusterRole `pier-backend-cluster-health`**  
   Least-privilege permissions for cluster read routes:
   - `get`, `list` on **nodes** and **pods**
   - `get` on **`/version`**, **`/healthz`**, **`/livez`**, **`/readyz`** (API discovery/health)

3. **ClusterRoleBinding `pier-backend-cluster-health`**  
   Links the ServiceAccount to that ClusterRole cluster-wide.

Without this file, in-cluster `/cluster/health` often returns **403 Forbidden**.

#### `k8s/deployment.yaml` (two resources)

1. **Deployment `pier-backend`**  
   - One replica of the API container (`image: pier-backend:dev` — build/tag locally or change to your registry).
   - Uses `serviceAccountName: pier-backend`.
   - Env: `PORT=3000`, `HOST=0.0.0.0`.
   - **readinessProbe** / **livenessProbe** hit `GET /health` on port 3000 so Kubernetes knows when the pod is ready or should restart.

2. **Service `pier-backend`**  
   ClusterIP on port **80** → pod port **3000**. Use `kubectl port-forward svc/pier-backend 3000:80` or an Ingress later for Traefik.

---

## Local vs in-cluster

| Where | How the API reaches k3s |
|-------|-------------------------|
| **Beater** | `KUBECONFIG` in `.env` or shell → mode `kubeconfig` |
| **Pod on k3s** | ServiceAccount token → mode `in-cluster` (no kubeconfig file in the image) |
