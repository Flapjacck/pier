# Kubernetes helpers

Small modules that talk to the API server or encode Pier conventions (labels, mappings).

| File | Purpose |
|------|---------|
| `client.ts` | Load kubeconfig (in-cluster vs local file). |
| `cluster-health.ts` | Version + node readiness for `/cluster/health`. |
| `list-pods.ts` | Pod list mapping for `/cluster/pods`. |
| `labels.ts` | `pier.app` label key, managed-by value, selector/label helpers for apps. |
| `apps.ts` | Deployment → `App` mapping, status rules, `listApps()` for `/apps`. |
