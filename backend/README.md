# pi backend

TypeScript API (`src/**/*.ts`). Edit `.ts` files only; `dist/` is compiled output for the Docker image.

Small control-plane API for the pi homelab platform. Right now: process health and a Kubernetes (k3s) connectivity check.

## Local dev (Beater)

Uses the same credentials as `kubectl` (`KUBECONFIG` or `~/.kube/config`).

```bash
cp .env.example .env
npm install
export KUBECONFIG=~/.kube/k3s-node.yaml
npm run dev
```

```bash
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3000/health/cluster | jq
```

## Production build

```bash
npm run build      # tsup → dist/ (used by Dockerfile)
npm run start:prod # node dist/index.js
```

Local runs use TypeScript directly: `npm run dev` or `npm start` (tsx).

## Run on the cluster

1. Build and push the image (or load into k3s): `docker build -t pi-backend:dev .`
2. Apply RBAC + Deployment: `kubectl apply -f k8s/`
3. Port-forward or expose via Ingress later.

In-cluster, the app calls `loadFromCluster()` and uses the ServiceAccount token — no kubeconfig file in the image.

If `/health/cluster` returns 403, apply the manifests in `k8s/rbac.yaml` (read-only `nodes` + `/version`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | API liveness |
| GET | `/health/cluster` | k3s API reachable; node counts and server version |
