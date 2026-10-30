# Kubernetes helpers

Modules that call the Kubernetes API or encode Pier conventions. The route handlers in [../routes/](../routes/README.md) take these as injectable dependencies, so tests don't need a cluster.

| File | Exports | Notes |
|------|---------|-------|
| `client.ts` | `isInCluster()`, `loadKubeConfig()`, `KubeConfigMode` | `in-cluster` when `KUBERNETES_SERVICE_HOST` is set and the ServiceAccount token file exists; otherwise `kubeconfig` via `loadFromDefault()` (`KUBECONFIG` or `~/.kube/config`). |
| `cluster-health.ts` | `getClusterHealth()`, `ClusterHealth` | `VersionApi.getCode()` plus `listNode()`. `ok` is true when there is at least one node and every node is `Ready`. Errors are thrown to the route. |
| `list-pods.ts` | `listClusterPods()`, `podToSummary()`, `readyColumn()`, `PodSummary`, `ClusterPodsResult` | `listPodForAllNamespaces()`, each pod mapped to `{ name, namespace, phase, nodeName?, ready: "x/y", startedAt? }`. |
| `labels.ts` | `APP_LABEL`, `MANAGED_BY_LABEL`, `MANAGED_BY_VALUE`, `appSelector()`, `appLabels()` | `pier.app=<name>` identifies an app; `app.kubernetes.io/managed-by=pier` marks Pier-owned objects. |
| `apps.ts` | `listApps()`, `deploymentToApp()`, `deriveStatus()`, `App`, `AppStatus` | Lists Deployments with label `pier.app`, sorted by name. `name` comes from the label (falling back to `metadata.name`) and `image` from the first container. Status rules are in [../routes/README.md](../routes/README.md#get-apps). |
