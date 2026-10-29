# pi

**What it is**  
A home-lab platform that takes an app (git repo or image) and deploys it onto a Kubernetes cluster with automatic routing and HTTPS.

**Stack (flexible)**  
Proxmox VM → k3s → small control-plane API → Ingress + a tunnel/DNS provider of your choice.

**Point of the project**  
Learn real Kubernetes and platform engineering without paying for a public cloud.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `backend/` | Control-plane API (TypeScript). Starts with HTTP health + cluster connectivity checks. |
| `.env.example` | LAN / SSH settings for fetching kubeconfig to Beater (optional ops scripts). |

## Backend (quick start)

Develop on **Beater** with the same kubeconfig you use for `kubectl`:

```bash
cd backend
cp .env.example .env
npm install
export KUBECONFIG=~/.kube/k3s-node.yaml   # or eval from your shell setup
npm run dev
```

- `GET http://localhost:3000/health` — API process is up  
- `GET http://localhost:3000/health/cluster` — talks to the k3s API (nodes + version)

When this API runs **inside** the cluster, it uses the pod ServiceAccount (in-cluster config). See `backend/README.md` and `backend/k8s/` for RBAC and a sample Deployment.

## k3s note

k3s is certified Kubernetes. This project uses the standard Kubernetes API and `@kubernetes/client-node` — the same as `kubectl`.

## Security

- Do not commit `.env`, kubeconfigs, or tokens.  
- Prefer in-cluster ServiceAccount + RBAC in production over mounting admin kubeconfig into pods.
