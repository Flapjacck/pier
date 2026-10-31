# pier backend

Fastify + TypeScript control-plane API for **pier**. It reads cluster state from k3s through `@kubernetes/client-node` and lists Pier-managed apps in the `pier-apps` namespace.

## Setup

Needs Node ≥ 20 and pnpm ≥ 9 (`packageManager` pins pnpm). The backend is its own pnpm package, so install it from `backend/`:

```bash
cd backend
pnpm install
cp .env.example .env   # set KUBECONFIG to an absolute path
pnpm dev               # http://127.0.0.1:3000
```

`dev` and `start` load `backend/.env` when it exists (Node `--env-file-if-exists`). Variables already in the shell environment take precedence.

## Environment

| Variable | Default | Used by | Notes |
|----------|---------|---------|-------|
| `PORT` | `3000` | server | Integer 1–65535, otherwise startup fails. |
| `HOST` | `127.0.0.1` | server | Any non-loopback host (anything other than `127.*`, `::1`, `localhost`) requires `PIER_API_TOKEN`, or startup fails. |
| `PIER_API_TOKEN` | unset | server | Bearer token for every route except `/health`. Generate with `openssl rand -hex 32`. |
| `PIER_NAMESPACE` | `pier-apps` | server | Namespace GET `/apps` and POST `/apps` use. |
| `PIER_INGRESS_DOMAIN` | unset | server, `deploy-local.sh` | Wildcard DNS suffix for ingress hosts (e.g. `apps.example.internal` or `10.0.0.87.nip.io`). Required if POST `/apps` receives a `host` parameter. Used by `deploy-local.sh` to render `deployment.yaml.tmpl`. |
| `KUBECONFIG` | `~/.kube/config` | server (outside a pod, at startup) | Read once at startup via `loadKubeConfig()`. Use an absolute path; `~` is not expanded in `.env`. Ignored in-cluster. Changes require a server restart. |
| `K3S_HOST` | none | `deploy-local.sh` | k3s node address for the SSH image import. |
| `K3S_SSH_USER` | none | `deploy-local.sh` | SSH user on the k3s node (needs passwordless `sudo k3s ctr`). |

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tsx watch --env-file-if-exists=.env src/index.ts` | Run with reload. |
| `start` | `tsx --env-file-if-exists=.env src/index.ts` | Run once, no build. |
| `build` | `tsup` | Bundle to `dist/`. |
| `start:prod` | `node dist/index.js` | Run the build (used by the Docker image). Does not load `.env`. |
| `test` | `node --import tsx --test 'tests/**/*.test.ts'` | Unit tests (`node:test`, no cluster needed). |
| `lint` | `eslint .` | Run ESLint on `src/` and `tests/`. |
| `typecheck` | `tsc --noEmit` | Type-check `src/` and `tests/`. |

## API

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/health` | none | `{ ok, service }`. No cluster call; used by the probes. |
| GET | `/cluster/health` | bearer | API server version and Ready/total node counts. |
| GET | `/cluster/pods` | bearer | Every pod in every namespace. |
| GET | `/apps` | bearer | Deployments in `PIER_NAMESPACE` labelled `pier.app`. |
| POST | `/apps` | bearer | Create Deployment, Service, and optional Ingress. Accepts JSON: `{ name, image, port, replicas?, host?, env? }`. Returns `201` with App; `400` for validation; `409` if name or host exists; `503` if cluster unreachable. |
| PATCH | `/apps/:name/scale` | bearer | Scale an app to 0–10 replicas. Accepts JSON: `{ replicas }`. Returns `200` with App; `404` if app unknown or terminating; `400`/`503` on error. |
| POST | `/apps/:name/restart` | bearer | Restart an app by triggering a pod rollout. No body. Returns `202` with `{ ok, restartedAt }`; `404` if app unknown; `400`/`503` on error. |
| DELETE | `/apps/:name` | bearer | Delete an app (Deployment, Service, Ingress). No body. Returns `204` empty (idempotent); `404` if app unknown or already gone; `400`/`503` on error. |

```bash
curl -H "Authorization: Bearer $PIER_API_TOKEN" http://127.0.0.1:3000/apps
```

- With no `PIER_API_TOKEN`, which is only possible on a loopback `HOST`, auth is off and the server logs a warning.
- A missing or wrong token returns `401 { ok: false, error: "unauthorized" }`.
- If the cluster can't be reached, the route returns `503` with `error: "cluster unreachable"`, and the full error goes to the server log.
- Fastify redacts the `Authorization` header from logs.

Response shapes, status rules and diagrams: [src/routes/README.md](src/routes/README.md).

### Cluster credentials

`src/k8s/client.ts` determines the mode once at startup and `src/k8s/clients.ts` loads all API clients:

| Where | Mode | Credentials |
|-------|------|-------------|
| Pod on k3s | `in-cluster` | ServiceAccount token. Used when `KUBERNETES_SERVICE_HOST` is set and `/var/run/secrets/kubernetes.io/serviceaccount/token` exists. |
| Dev / local | `kubeconfig` | `KUBECONFIG` (if set), else `~/.kube/config`. |

The kubeconfig is loaded once at startup. Loading only reads files and makes no network call.

- If it fails to load (missing or unparsable file, no current context, context without a cluster), the server still starts. It logs a one-line warning (`cluster unreachable at startup: ...`) and every cluster and app route returns `503 { ok: false, error: "cluster unreachable" }`. `/health` stays `200`.
- If it loads but the API server can't be reached, startup succeeds silently. Each cluster or app request then fails and returns the same `503`, with the full error in the server log.

## Deploy to k3s

`scripts/deploy-local.sh [TAG]` runs the backend as a pod in `default` with ServiceAccount `pier-backend`.

Prerequisites:
- Docker on the machine running the script.
- SSH key access to the node as `K3S_SSH_USER`, with passwordless sudo for `k3s ctr`. Check with `ssh "$K3S_SSH_USER@$K3S_HOST" 'sudo -n k3s ctr version'`.
- `kubectl` pointed at the cluster (`KUBECONFIG`).
- `K3S_HOST`, `K3S_SSH_USER` and `PIER_API_TOKEN` set in `backend/.env` or the environment. Values already in the environment win.

What it does:
1. Builds `pier-backend:$TAG`. `TAG` defaults to the git short SHA, plus `-dirty` if tracked files have uncommitted changes.
2. Pipes `docker save` over SSH into `sudo k3s ctr images import -`.
3. Applies the manifests in [k8s/](k8s/README.md#apply-order) order.
4. Creates or updates Secret `default/pier-backend-secrets` from `PIER_API_TOKEN`, without printing it.
5. Runs `kubectl set image` to `pier-backend:$TAG` and waits up to 120s for the rollout.

Known gaps, tracked in [#19](https://github.com/Flapjacck/pier/issues/19):
- Every run applies `deployment.yaml`, which resets the image to the `pier-backend:dev` placeholder, and then sets the real tag. So each run rolls out twice, and the short-lived `:dev` ReplicaSet fails with `ImagePullBackOff`.
- Rerunning with the same tag still rolls out again; it is not a no-op.
- The `.env` parser can't handle values containing `'` or `\`, and skips a final line that has no trailing newline.

Test through a port-forward:

```bash
kubectl -n default port-forward svc/pier-backend 3000:80
curl -s http://127.0.0.1:3000/health
curl -s -H "Authorization: Bearer $PIER_API_TOKEN" http://127.0.0.1:3000/cluster/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/apps   # 401
```

Rotate the token. The pod reads the Secret only at startup, so it has to be restarted:

```bash
# 1. put the new value in backend/.env (PIER_API_TOKEN=...)
./backend/scripts/deploy-local.sh                       # updates the Secret
kubectl -n default rollout restart deploy/pier-backend  # picks up the new token
kubectl -n default rollout status deploy/pier-backend
```

Debug and roll back:

```bash
kubectl -n default describe pod -l app=pier-backend
kubectl -n default logs -l app=pier-backend
kubectl -n default rollout undo deploy/pier-backend
```

Manifests, RBAC, Pod Security, quota and the Service-type policy: [k8s/README.md](k8s/README.md).

## Layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | Entry point: `loadConfig()` (exits 1 on error), `buildApp(config)`, graceful shutdown, `listen`. |
| `src/app.ts` | Fastify instance (info logging, auth header redacted). Builds K8s clients once via `createK8sClients()`. Registers auth and route plugins, passing shared clients. |
| `src/config.ts` | `loadConfig()`: env parsing and the "no token on a non-loopback host" check. |
| `src/shutdown.ts` | One-shot SIGINT/SIGTERM handler. Forces exit after 10s if `app.close()` hangs. |
| `src/plugins/auth.ts` | Bearer token `onRequest` hook (SHA-256 + `timingSafeEqual`). Skips `/health`. |
| `src/routes/` | HTTP handlers. See [src/routes/README.md](src/routes/README.md). |
| `src/k8s/` | Kubernetes client and mapping helpers. See [src/k8s/README.md](src/k8s/README.md). |
| `tests/` | `node:test` suites mirroring `src/` (config, auth, routes, k8s mappers). Routes are tested with injected fakes. |
| `tests/helpers/` | `fake-clients.ts` (fake `K8sClientsResult` for `buildApp(config, { k8s })`), `fake-kubeconfig-loader.ts` (counting loader for `buildApp(config, { loadKubeConfig })`), `test-config.ts` (`testConfig()` and `authHeader`). |
| `tests/fixtures/` | Test data: `kubeconfig.yaml` (valid but fake kubeconfig for testing). |
| `k8s/` | Manifests. See [k8s/README.md](k8s/README.md). |
| `scripts/deploy-local.sh` | Build, import and roll out to k3s (above). |
| `Dockerfile` | Two-stage `node:22-alpine` build, pinned by digest. Stage 1 runs `pnpm install --frozen-lockfile`, `build` and `prune --prod`. Stage 2 runs `node dist/index.js` as `node` (uid 1000) on port 3000. |
| `.dockerignore` | Keeps `node_modules`, `dist`, `.env*` (except `.env.example`), `tests`, `k8s`, `scripts`, `*.md` and `.git` out of the build context. |
| `.env.example` | Template for `.env`. |
| `pnpm-workspace.yaml` | pnpm settings (`allowBuilds`). |
| `tsconfig.json` | Strict, type-check only (`noEmit`); `tsup` does the bundling. |
| `dist/` | Build output. Not committed; don't edit. |
