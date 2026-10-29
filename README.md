# pier (repo folder: `pi`)

**What it is**  
**pier** is a home-lab platform where apps “dock” onto your cluster: give it a git repo or image, and it deploys onto k3s with routing and HTTPS.

**Stack (flexible)**  
Proxmox VM → k3s → pier control-plane API → Ingress + a tunnel/DNS provider of your choice.

**Point of the project**  
Learn real Kubernetes and platform engineering without paying for a public cloud.

## Layout

| Path | Purpose |
|------|---------|
| `backend/` | pier control-plane API (TypeScript). See [backend/README.md](backend/README.md). |

## Quick start (API on Beater)

```bash
cd backend
cp .env.example .env
npm install
export KUBECONFIG=~/.kube/k3s-node.yaml
npm run dev
curl -s http://localhost:3000/health/cluster | jq
```
