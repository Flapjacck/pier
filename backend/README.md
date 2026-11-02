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
| `PIER_API_TOKEN` | unset | server | Bearer token for `/api/*` (except `GET /api/session`, login, and logout when unset). Generate with `openssl rand -hex 32`. |
| `PIER_NAMESPACE` | `pier-apps` | server | Namespace GET `/apps` and POST `/apps` use. |
| `PIER_INGRESS_DOMAIN` | unset | server, `deploy-local.sh` | Wildcard DNS suffix for ingress hosts (e.g. `apps.example.internal` or `192.0.2.10.nip.io`). Required if POST `/apps` receives a `host` parameter. Used by `deploy-local.sh` to render `deployment.yaml.tmpl`. |
| `PIER_PUBLIC_DIR` | unset | server | Optional path to public directory for serving static files (dashboard SPA). Defaults to `../public` relative to `dist/` in production. Used in development to test static file serving. Leave empty in production. |
| `PIER_TRUST_PROXY` | unset (false) | server | Set to `true` when behind a reverse proxy (Traefik, Nginx) to trust `X-Forwarded-Proto` and `X-Forwarded-For` headers. Unsafe if exposed directly to untrusted networks. |
| `PIER_DASHBOARD_HOST` | unset | server, `deploy-local.sh` | Optional DNS hostname for the dashboard (e.g. `pier.example.com`). Reserved in POST `/api/apps` to prevent app name collision. Used by `deploy-local.sh` to render dashboard ingress. |
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

All cluster and app routes are served under the `/api` prefix. The health endpoint is available at both `/health` (root) and `/api/health`.

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/health` | none | `{ ok, service }`. No cluster call; used by the probes. |
| GET | `/api/health` | none | `{ ok, service }`. Duplicate of `/health`. |
| POST | `/api/login` | none* | Authenticate with the API token to get a session cookie. Accepts JSON: `{ token }` (1–512 chars). Returns `204` with `Set-Cookie pier_session` on success; `400` if auth disabled; `401` if wrong token; `429` if rate limited. |
| POST | `/api/logout` | none* | Clear the session cookie. Returns `204`. |
| GET | `/api/session` | auth** | Get session status and ingress domain. Returns `200 { ok, authDisabled, ingressDomain }`; `401` if not authenticated (or returns `200` with `authDisabled: true` if no token configured on loopback). |
| GET | `/api/cluster/health` | auth | API server version and Ready/total node counts. |
| GET | `/api/cluster/pods` | auth | Every pod in every namespace. |
| GET | `/api/apps` | auth | Deployments in `PIER_NAMESPACE` labelled `pier.app`. |
| POST | `/api/apps` | auth | Create Deployment, Service, and optional Ingress. Accepts JSON: `{ name, image, port, replicas?, host?, env? }`. Returns `201` with App; `400` for validation; `409` if name or host exists; `503` if cluster unreachable. |
| GET | `/api/apps/:name` | auth | Retrieve a single app. Returns `200` with App; `400` if name is invalid; `404` if not found; `503` if cluster unreachable. |
| GET | `/api/apps/:name/pods` | auth | List pods for an app. Returns `200 [ { name, namespace, phase, ready, … } ]`; `404` if app not found; `503` if cluster unreachable. |
| GET | `/api/apps/:name/logs` | auth | Stream logs from an app pod (plain text or SSE). Query params: `pod`, `tail` (1–5000, default 200), `follow` (true/false). Returns `200` plain text or `200 text/event-stream`; `400` if params invalid; `404` if app/pod not found; `503` if unreachable. |
| PATCH | `/api/apps/:name/scale` | auth | Scale an app to 0–10 replicas. Accepts JSON: `{ replicas }`. Returns `200` with App; `404` if app unknown or terminating; `400`/`503` on error. |
| POST | `/api/apps/:name/restart` | auth | Restart an app by triggering a pod rollout. No body. Returns `202` with `{ ok, restartedAt }`; `404` if app unknown; `400`/`503` on error. |
| DELETE | `/api/apps/:name` | auth | Delete an app (Deployment, Service, Ingress). No body. Returns `204` empty (idempotent); `404` if app unknown or already gone; `400`/`503` on error. |

\* Public endpoints; `POST /api/login` returns `400` if auth is disabled.  
\*\* Requires bearer token or valid session cookie (see "Authentication" below).

### Authentication

Bearer token authentication:

```bash
curl -H "Authorization: Bearer $PIER_API_TOKEN" http://192.0.2.10.nip.io/api/apps
```

Session cookie authentication (login → cookie → requests):

```bash
# 1. Login with the API token.
curl -i -c jar -H "Content-Type: application/json" -d "{\"token\":\"$PIER_API_TOKEN\"}" http://192.0.2.10.nip.io/api/login

# 2. Use the saved session cookie for subsequent requests.
curl -b jar http://192.0.2.10.nip.io/api/apps

# 3. Logout (clears the cookie).
curl -b jar -c jar -X POST http://192.0.2.10.nip.io/api/logout
```

**Bearer tokens** (`Authorization: Bearer <token>`, case-insensitive scheme, optional whitespace):
- Take precedence over session cookies.
- Do not require an `Origin` header check.
- Compared against `PIER_API_TOKEN` using timing-safe SHA-256 hashing to prevent timing attacks.

**Session cookies** (`pier_session`):
- Created by `POST /api/login` with the API token.
- Valid for 7 days from creation.
- Stateless and signed with an HMAC-SHA256 key derived from `PIER_API_TOKEN`.
- Rotating `PIER_API_TOKEN` invalidates all sessions automatically (they won't verify with the new key).
- Cannot be revoked server-side individually; rotate the token to kill all sessions.
- Set with `HttpOnly`, `SameSite=Strict`, `Path=/api`, `Max-Age=604800`, and `Secure` when the connection is HTTPS.
- Cleared on the client by `POST /api/logout`.

**Cookie-authenticated requests with mutations** (POST, PUT, PATCH, DELETE):
- Must include an `Origin` header (from the browser or fallback to `Referer` origin) that matches `req.headers.host`.
- If the header is missing or mismatched, the request is rejected with `403 { ok: false, error: "forbidden origin" }` (CSRF protection).
- Example: a request to `http://192.0.2.10.nip.io/api/apps` with a session cookie must have `Origin: http://192.0.2.10.nip.io` or a matching `Referer`.

**Rate limiting**:
- `POST /api/login` limits failed attempts per IP to 5 within 60 seconds.
- After the 6th failure, the request is rejected with `429 { ok: false, error: "too many attempts" }` until the window passes.
- Successful login clears the rate limit entry for that IP.

**No token configured** (loopback only):
- Only available on loopback (`HOST` is `127.*`, `::1`, or `localhost`).
- Every `/api/*` request returns `401` except `GET /api/session`, `POST /api/login`, and `POST /api/logout`.
- `GET /api/session` returns `{ ok: true, authDisabled: true, … }` so the UI can show a “set `PIER_API_TOKEN` in `backend/.env`” screen instead of a login loop.
- `/health` and `/api/health` remain public (query strings on `/health` are allowed).
- Startup logs: `"auth disabled: PIER_API_TOKEN not set (loopback only)"`.

**Logging**:
- Fastify redacts the `Authorization` header, `Cookie` header, and `Set-Cookie` response header from logs.

### Error responses

- Missing or wrong token: `401 { ok: false, error: "unauthorized" }`.
- CSRF protection (missing/mismatched Origin on cookie-authed mutations): `403 { ok: false, error: "forbidden origin" }`.
- Rate limited on login: `429 { ok: false, error: "too many attempts" }`.
- Validation error: `400 { ok: false, error: "invalid request", details?: "first error message" }`.
- Cluster unreachable: `503 { ok: false, error: "cluster unreachable" }`.

Response shapes, status rules and diagrams: [src/routes/README.md](src/routes/README.md).

## Authentication

**Session cookie** (`POST /api/login`):
- Sending `{ token: "$PIER_API_TOKEN" }` to `POST /api/login` returns `204` and sets `pier_session` cookie.
- Cookie is **HttpOnly, SameSite=Strict, Path=/api, Max-Age=604800 (7 days), Secure** (when over HTTPS).
- Stateless and signed with HMAC-SHA256 derived from `PIER_API_TOKEN`.
- **Rotating `PIER_API_TOKEN` invalidates every session**. All users will be logged out and see the login screen.
- Cannot be revoked individually; rotate the token to kill all sessions.

**Bearer token** (for curl and scripts):
- Include `Authorization: Bearer $PIER_API_TOKEN` header (scheme is case-insensitive).
- Takes precedence over session cookies and does not require an `Origin` header check.
- Example: `curl -H "Authorization: Bearer $TOKEN" http://pier.example.com/api/apps`

**Mutating requests with cookies** (POST, PATCH, DELETE):
- Must include `Origin` header (from browser) or fallback to `Referer` origin.
- Must match the request's host. Mismatched origin → `403 { ok: false, error: "forbidden origin" }` (CSRF protection).
- Example: a POST to `http://pier.example.com/api/apps` with a session cookie must have `Origin: http://pier.example.com`.

**Rate limiting** on `POST /api/login`:
- 5 failed attempts per IP within 60 seconds are allowed.
- 6th failure → `429 { ok: false, error: "too many attempts" }` until the window resets.
- Successful login clears the limit for that IP.

**No token configured** (loopback only, `HOST` is `127.*`, `::1`, or `localhost`):
- `PIER_API_TOKEN` unset allows running on loopback without authentication.
- Every `/api/*` route returns `401` except:
  - `POST /api/login` → `400 { ok: false, error: "auth disabled" }`
  - `POST /api/logout` → `204` (always works)
  - `GET /api/session` → `200 { ok: true, authDisabled: true, … }` (tells frontend to show "set token" screen)
- `/health` and `/api/health` are always public.

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

`scripts/deploy-local.sh [--dry-run | --render [--out DIR]] [TAG]` builds the image, imports it into containerd, renders and applies manifests, and waits for rollout. The backend pod runs in the `default` namespace with ServiceAccount `pier-backend`.

| Mode | What it does | Needs |
|------|--------------|-------|
| (none) | Build, import over SSH, apply, wait for rollout. | Docker, SSH, cluster, `K3S_HOST`, `K3S_SSH_USER`, `PIER_API_TOKEN` |
| `--dry-run` | `kubectl apply --dry-run=server` on every manifest. No build, no SSH, nothing changed. | Cluster, `PIER_API_TOKEN` |
| `--render [--out DIR]` | Render every manifest to `DIR` (default: new temp dir) as `NN-<name>.yaml` in apply order, then lint offline: no `__PLACEHOLDER__` left, and every file parses (`kubectl kustomize`; `apply --dry-run=client` can't run without a cluster). The Secret is rendered with the value `REDACTED`. | `kubectl` on PATH only |
| `-h`, `--help` | Print usage. | |

`TAG` defaults to the git short SHA (plus `-dirty`). It may only contain letters, digits, `.`, `_` and `-`. `PIER_ENV_FILE` overrides the env file path (default `backend/.env`); variables already set in the shell win over the file.

```bash
./backend/scripts/deploy-local.sh --render --out /tmp/pier-render   # offline check
./backend/scripts/deploy-local.sh --dry-run                         # server-side check
```

### Prerequisites

- **Docker** on the machine running the script (builds the image).
- **kubectl** pointed at the cluster (via `KUBECONFIG`).
- **SSH key access** to the k3s node as `K3S_SSH_USER`, with passwordless `sudo k3s ctr`. Verify with:
  ```bash
  ssh "$K3S_SSH_USER@$K3S_HOST" 'sudo -n k3s ctr version'
  ```
- **Required environment variables** in `backend/.env` or the shell:
  - `K3S_HOST`: k3s node IP or hostname
  - `K3S_SSH_USER`: SSH username
  - `PIER_API_TOKEN`: Bearer token (generate with `openssl rand -hex 32`)
  - `PIER_INGRESS_DOMAIN`: Wildcard DNS suffix (e.g. `192.0.2.10.nip.io` or `apps.example.internal`), used to render the dashboard ingress
  - `PIER_DASHBOARD_HOST` (optional): Explicit dashboard hostname; if unset, derived from `PIER_INGRESS_DOMAIN` as `pier.<PIER_INGRESS_DOMAIN>`

### What it does

1. **Builds image:** `pier-backend:$TAG`. `TAG` defaults to the git short SHA, plus `-dirty` if tracked files have uncommitted changes. `--dry-run` and `--render` skip this step.
2. **Imports to containerd** via SSH: `docker save | ssh $K3S_SSH_USER@$K3S_HOST sudo k3s ctr images import -`
3. **Applies manifests** in order (see [k8s/README.md#apply-order](k8s/README.md#apply-order)):
   - `namespace.yaml` (creates `pier-apps` with Pod Security labels)
   - `rbac.yaml` (ClusterRole for cluster health)
   - `rbac-apps.yaml` (Role for app management in `pier-apps`)
   - Optional: `quota.yaml`, `networkpolicies.yaml`, `policy-services.yaml` (if present)
   - `service.yaml` (Service for backend)
4. **Creates or updates Secret** `default/pier-backend-secrets` from `PIER_API_TOKEN`. The token is piped to `kubectl` on stdin (`--from-file=PIER_API_TOKEN=/dev/stdin`), so it never appears in any command line or `ps`, and the rendered Secret is piped straight to `kubectl apply` without touching disk.
5. **Renders and applies** `deployment.yaml.tmpl`, substituting placeholders:
   - `__IMAGE__`: `pier-backend:$TAG`
   - `__TOKEN_SHA256__`: SHA256 hash of `PIER_API_TOKEN`
   - `__INGRESS_DOMAIN__`: `PIER_INGRESS_DOMAIN`
   - `__DASHBOARD_HOST__`: `PIER_DASHBOARD_HOST` or derived value
6. **Applies dashboard ingress** from `ingress.yaml.tmpl` if `PIER_DASHBOARD_HOST` is set, rendering the hostname.
7. **Waits for rollout** (up to 120s) with `kubectl rollout status deploy/pier-backend`.

### Example: deploy with custom tag

```bash
cd backend
cp .env.example .env
# Edit .env: set K3S_HOST, K3S_SSH_USER, PIER_API_TOKEN, PIER_INGRESS_DOMAIN
./scripts/deploy-local.sh v1.2.3
```

### Test deployment through port-forward

```bash
kubectl -n default port-forward svc/pier-backend 3000:3000
curl -s http://127.0.0.1:3000/health
curl -s -H "Authorization: Bearer $PIER_API_TOKEN" http://127.0.0.1:3000/api/cluster/health
curl -s http://127.0.0.1:3000/api/apps   # 401 (no auth)
```

### Rotate token (invalidates all sessions)

The pod reads the Secret only at startup. When `PIER_API_TOKEN` changes, the pod must be restarted. The hash annotation triggers a new rollout.

```bash
# 1. Update PIER_API_TOKEN in backend/.env
# 2. Rerun the script (creates new Secret, renders deployment with new hash)
./backend/scripts/deploy-local.sh

# 3. Verify new pod is running
kubectl -n default get pod -l app=pier-backend
```

All existing sessions become invalid (the HMAC key is derived from the new token).

### Debug and logs

```bash
# Pod status and events
kubectl -n default describe pod -l app=pier-backend

# Logs
kubectl -n default logs -l app=pier-backend -f

# Rollback to previous image
kubectl -n default rollout undo deploy/pier-backend
```

### Manifests and configuration

For RBAC, Pod Security, ResourceQuota, NetworkPolicies, and the Service-type admission policy, see [k8s/README.md](k8s/README.md).

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
| `tests/scripts/` | `load-env.test.ts` (parser cases, incl. `set -euo pipefail`) and `deploy-local.test.ts` (runs the script against shim `kubectl`/`docker`/`ssh` that log argv: `--render` offline, no token in any argv, flag errors). |
| `tests/helpers/` | `fake-clients.ts` (fake `K8sClientsResult` for `buildApp(config, { k8s })`), `fake-kubeconfig-loader.ts` (counting loader for `buildApp(config, { loadKubeConfig })`), `test-config.ts` (`testConfig()` and `authHeader`), `run-bash.ts` (`runBash` in a clean env, `withTempDir`). |
| `tests/fixtures/` | Test data: `kubeconfig.yaml` (valid but fake kubeconfig for testing). |
| `k8s/` | Manifests. See [k8s/README.md](k8s/README.md). |
| `scripts/deploy-local.sh` | Build, import and roll out to k3s, or `--dry-run` / `--render` (above). |
| `scripts/lib/load-env.sh` | `load_env_file`: safe `.env` parser (no eval; existing env wins; safe under `set -e`). |
| `scripts/lib/render.sh` | `manifest_names`, `render_manifest`, `render_to_dir`, `lint_rendered`: one renderer shared by every deploy mode. |
| `Dockerfile` | Two-stage `node:22-alpine` build, pinned by digest. Stage 1 runs `pnpm install --frozen-lockfile`, `build` and `prune --prod`. Stage 2 runs `node dist/index.js` as `node` (uid 1000) on port 3000. |
| `.dockerignore` | Keeps `node_modules`, `dist`, `.env*` (except `.env.example`), `tests`, `k8s`, `scripts`, `*.md` and `.git` out of the build context. |
| `.env.example` | Template for `.env`. |
| `pnpm-workspace.yaml` | pnpm settings (`allowBuilds`). |
| `tsconfig.json` | Strict, type-check only (`noEmit`); `tsup` does the bundling. |
| `dist/` | Build output. Not committed; don't edit. |
