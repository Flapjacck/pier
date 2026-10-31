# Kubernetes manifests

Manifests for the `pier-backend` pod (namespace `default`) and the guard rails on `pier-apps`, the namespace where Pier-deployed apps run. The cluster is a single k3s node: 4 CPU, about 9.2Gi allocatable memory, Traefik ingress and ServiceLB.

## Files

| File | Objects |
|------|---------|
| [namespace.yaml](namespace.yaml) | Namespace `pier-apps`, with Pod Security labels: enforce `baseline`, warn and audit `restricted`, all at version `latest`. |
| [rbac.yaml](rbac.yaml) | ServiceAccount `default/pier-backend`; ClusterRole and ClusterRoleBinding `pier-backend-cluster-health`. |
| [rbac-apps.yaml](rbac-apps.yaml) | Role and RoleBinding `pier-app-manager` in `pier-apps`, bound to `default/pier-backend`. |
| [quota.yaml](quota.yaml) | ResourceQuota `pier-apps-quota` and LimitRange `pier-apps-limits` in `pier-apps`. |
| [policy-services.yaml](policy-services.yaml) | ValidatingAdmissionPolicy and binding `pier-apps-clusterip-only`. Only Services of type ClusterIP are admitted in `pier-apps`. |
| [deployment.yaml](deployment.yaml) | Deployment and ClusterIP Service `pier-backend` in `default`. |

## Apply order

`../scripts/deploy-local.sh` applies the files in this order, renders `deployment.yaml.tmpl` substituting `__IMAGE__`, `__TOKEN_SHA256__`, and `__INGRESS_DOMAIN__` (from `PIER_INGRESS_DOMAIN` env var), and applies the result (see [backend README](../README.md#deploy-to-k3s)):

```bash
kubectl apply -f backend/k8s/namespace.yaml
kubectl apply -f backend/k8s/rbac.yaml
kubectl apply -f backend/k8s/rbac-apps.yaml
kubectl apply -f backend/k8s/quota.yaml
kubectl apply -f backend/k8s/policy-services.yaml
kubectl apply -f backend/k8s/deployment.yaml
```

The namespace has to exist before anything namespaced in `pier-apps` is applied. The ServiceAccount should exist before the Deployment.

`deployment.yaml` carries the placeholder image `pier-backend:dev`, which has no matching image anywhere. Applying it by hand resets the live image and starts a rollout that fails with `ImagePullBackOff`. Follow it with `kubectl -n default set image deploy/pier-backend api=pier-backend:<tag>`, or use the script. [#19](https://github.com/Flapjacck/pier/issues/19) tracks fixing this.

## RBAC

| Subject | Scope | Grants |
|---------|-------|--------|
| `pier-backend-cluster-health` (ClusterRole) | cluster | `get`/`list` on `nodes` and `pods`; `get` on `/version`, `/healthz`, `/livez`, `/readyz`. Dropping `pods` is a `TODO(#5)`. |
| `pier-app-manager` (Role) | `pier-apps` | Full CRUD on `deployments`, `services` and `ingresses`; `get`/`update`/`patch` on `deployments/scale`; `get`/`list`/`watch` on `pods`; `get` on `pods/log`. |

Check what it allows:

```bash
SA=system:serviceaccount:default:pier-backend
kubectl auth can-i create deployments -n pier-apps --as=$SA       # yes
kubectl auth can-i patch deployments/scale -n pier-apps --as=$SA  # yes
kubectl auth can-i get pods/log -n pier-apps --as=$SA             # yes
kubectl auth can-i create ingresses -n pier-apps --as=$SA         # yes
kubectl auth can-i delete pods -n pier-apps --as=$SA              # no
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
| `pods` | 20 | Stops runaway replica counts. |
| `services` | 20 | |
| `services.nodeports` | 0 | No node ports. The Service-type policy blocks these as well. |
| `services.loadbalancers` | 0 | No ServiceLB. The Service-type policy blocks these as well. |
| `persistentvolumeclaims` | 0 | No persistent storage yet. |

Because `requests.*` and `limits.*` are in the quota, every container needs them. The LimitRange (type `Container`) fills them in when a container doesn't set them:

| LimitRange | CPU | Memory |
|------------|-----|--------|
| `defaultRequest` | 50m | 64Mi |
| `default` (limit) | 500m | 256Mi |
| `max` per container | 2 | 2Gi |

```bash
kubectl describe resourcequota pier-apps-quota -n pier-apps
kubectl describe limitrange pier-apps-limits -n pier-apps
```

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
| `Services in pier-apps must be type ClusterIP` | Service type NodePort, LoadBalancer or ExternalName | Leave out `type` or use `ClusterIP`. |
