# Kubernetes manifests

This folder contains all manifests for deploying pier-backend and configuring the pier-apps namespace in k3s.

## Apply order

Manifests must be applied in this order (enforced by `scripts/deploy-local.sh`):

1. **`namespace.yaml`** — creates `pier-apps` namespace with Pod Security Standard labels
2. **`rbac.yaml`** — pier-backend ServiceAccount and cluster-wide permissions
3. **`rbac-apps.yaml`** — pier-app-manager Role for managing apps in pier-apps
4. **`quota.yaml`** — resource quotas and limit range for pier-apps (if present)
5. **`policy-services.yaml`** — admission policy restricting Services to ClusterIP (if present)
6. **`deployment.yaml`** — pier-backend Deployment and Service

Reason: Kubernetes objects may have dependencies (e.g., RoleBinding needs the Role to exist; Deployment needs ServiceAccount).

## File reference

| File | What it does |
|------|--------------|
| `namespace.yaml` | Creates `pier-apps` namespace with Pod Security Standard enforcement (baseline) and warn/audit (restricted) labels. |
| `rbac.yaml` | ServiceAccount `pier-backend` in `default` namespace; ClusterRole for cluster health and RBAC bindings. |
| `rbac-apps.yaml` | Role `pier-app-manager` in `pier-apps` namespace; grants CRUD on Deployments, Services, Ingresses. |
| `quota.yaml` | ResourceQuota and LimitRange for `pier-apps`: 2 CPU / 4Gi memory requests; 4 CPU / 6Gi limits; max 20 pods. LimitRange defaults: 50m/64Mi request, 500m/256Mi limit. |
| `policy-services.yaml` | ValidatingAdmissionPolicy restricting Services to `type: ClusterIP` (blocks NodePort, LoadBalancer, ExternalName). |
| `deployment.yaml` | pier-backend Deployment (`default` namespace) and Service. |

## Pod Security Standards (PSS)

The `pier-apps` namespace enforces **baseline** Pod Security and warns/audits **restricted**.

### Baseline (enforced)

Baseline blocks:
- `privileged: true` in containers
- `hostPath` volumes
- `hostNetwork: true`
- `hostPID: true`
- `hostIPC: true`
- Unapproved capability additions (e.g., `CAP_NET_RAW`)
- `runAsUser: 0` (root)
- SELinux type `spc_t`

Rationale: baseline permits root images like `nginx:1.27` (common for web apps), but blocks host access that could compromise the cluster.

### Restricted (warn/audit)

Restricted additionally requires:
- `runAsNonRoot: true`
- `allowPrivilegeEscalation: false`
- `capabilities.drop: ["ALL"]`
- `seccompProfile.type` must be "RuntimeDefault" or "Localhost"
- `seLinuxOptions.level` restricted format

Future: once all app manifests are hardened, we will move the namespace label to `enforce: restricted`.

## Resource quota and limits

The quota reserves 2 CPU / 4Gi memory for pier-apps, leaving headroom for k3s system pods and pier-backend (which runs in `default` namespace and is not affected).

Check usage:
```bash
kubectl describe resourcequota pier-apps-quota -n pier-apps
kubectl describe limitrange pier-apps-limits -n pier-apps
```

| Quota | Value | Reason |
|-------|-------|--------|
| requests.cpu | 2 | Conservative share of 4-CPU node |
| requests.memory | 4Gi | Headroom on ~9.2Gi allocatable |
| limits.cpu | 4 | Allow burst; k3s system can still run |
| limits.memory | 6Gi | Hard cap; prevents OOMKill cascades |
| pods | 20 | Typical demo namespace; prevent runaway count |
| services | 20 | One service per pod is typical |
| services.nodeports | 0 | Blocked by admission policy; must be ClusterIP |
| services.loadbalancers | 0 | Blocked by admission policy; must be ClusterIP |
| persistentvolumeclaims | 0 | Not yet used; reserved for future apps |

LimitRange applies pod defaults when containers have no requests/limits specified:
- **Default request**: 50m CPU, 64Mi memory (minimal working service)
- **Default limit**: 500m CPU, 256Mi memory (typical production container)
- **Max**: 2 CPU, 2Gi memory per container (enforced upper bound)

## Service type restriction

The `pier-apps` namespace policy restricts all Services to `type: ClusterIP`. This is enforced by ValidatingAdmissionPolicy `pier-apps-clusterip-only`.

Why:
- **k3s ServiceLB**: k3s automatically exposes LoadBalancer and NodePort Services on the host IP (127.0.0.1 in dev, node IP in production).
- **Attack surface**: Unintended service exposure could allow external access to internal services.
- **Simplicity**: ClusterIP is sufficient for inter-pod and port-forward testing.

If an app needs external access, expose it via an Ingress (later work) or port-forward.

## Notes for manifest builders

When creating manifests for pier-apps:

1. **Always set resource requests and limits** in the container spec. The LimitRange provides defaults, but explicit values are clearer and prevent surprises.
   ```yaml
   resources:
     requests:
       cpu: 50m
       memory: 64Mi
     limits:
       cpu: 500m
       memory: 256Mi
   ```

2. **Set security context for restricted compliance**:
   ```yaml
   securityContext:
     runAsNonRoot: true
     runAsUser: 1000
     allowPrivilegeEscalation: false
     capabilities:
       drop: ["ALL"]
     seccompProfile:
       type: RuntimeDefault
   ```

3. **Service type must be ClusterIP** (explicitly or omitted, which defaults to ClusterIP):
   ```yaml
   spec:
     type: ClusterIP
     ports:
       - port: 80
         targetPort: 8080
   ```

4. **Disable ServiceAccountToken if the app doesn't need the cluster API**:
   ```yaml
   automountServiceAccountToken: false
   ```

5. **Test with `kubectl --dry-run=server`** before applying:
   ```bash
   kubectl apply -f my-app.yaml --dry-run=server
   ```
   This simulates the apply, running admission policies and validating the manifest.

## Debugging rejected deployments

If a Deployment is rejected by Pod Security or Quota, the pods never become Ready and the app status shows `building` (rollout stalled) or `failed` (deadline).

Check:
```bash
# Recent events (most recent first)
kubectl get events -n pier-apps --sort-by=.lastTimestamp

# ReplicaSet status (where the pod template issues usually surface)
kubectl describe rs -n pier-apps

# Pod logs and events
kubectl describe pod -n pier-apps
```

Common errors:
- **Pod Security baseline violation**: fix with `allowPrivilegeEscalation: false`, remove `hostPath`, etc.
- **Quota exceeded**: check that the Deployment has resource requests/limits set.
- **Service type rejected**: ensure Services have `type: ClusterIP` or omit the type field.
