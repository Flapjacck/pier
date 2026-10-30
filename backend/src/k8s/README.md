# Kubernetes helpers

Modules that call the Kubernetes API or encode Pier conventions. The route handlers in [../routes/](../routes/README.md) take these as injectable dependencies, so tests don't need a cluster.

| File | Exports | Notes |
|------|---------|-------|
| `clients.ts` | `createK8sClients()`, `K8sClients`, `K8sClientsResult` | Loads kubeconfig once at startup, builds all four API clients (`CoreV1Api`, `VersionApi`, `AppsV1Api`, `NetworkingV1Api`), and returns them as a bundle. Never throws; errors are wrapped in `{ ok: false, error }`. Routes pass the result to handlers so the kubeconfig is loaded once per app, not per request. |
| `client.ts` | `isInCluster()`, `loadKubeConfig()`, `KubeConfigMode`, `KubeConfigLoader`, `LoadedKubeConfig` | Loads and validates kubeconfig: `in-cluster` if `KUBERNETES_SERVICE_HOST` is set and the ServiceAccount token exists, else `loadFromFile(KUBECONFIG)` if a path is given, else `loadFromDefault()` (`~/.kube/config`). Throws if there is no current context, or if `getCurrentCluster()` finds no cluster for it (`kubeconfig: context "<name>" has no cluster`). |
| `cluster-health.ts` | `getClusterHealth()`, `ClusterHealth` | Takes `CoreV1Api`, `VersionApi`, and `mode`. Calls `VersionApi.getCode()` plus `listNode()`. `ok` is true when there is at least one node and every node is `Ready`. Errors are thrown for routes to handle. |
| `list-pods.ts` | `listClusterPods()`, `podToSummary()`, `readyColumn()`, `PodSummary`, `ClusterPodsResult` | Takes `CoreV1Api` and `mode`. Calls `listPodForAllNamespaces()`, maps each pod to `{ name, namespace, phase, nodeName?, ready: "x/y", startedAt? }`. |
| `labels.ts` | `APP_LABEL`, `MANAGED_BY_LABEL`, `MANAGED_BY_VALUE`, `appSelector()`, `appLabels()` | `pier.app=<name>` identifies an app; `app.kubernetes.io/managed-by=pier` marks Pier-owned objects. |
| `apps.ts` | `listApps()`, `deploymentToApp()`, `deriveStatus()`, `App`, `AppStatus` | Takes `AppsV1Api` and namespace. Lists Deployments with label `pier.app`, sorted by name. `name` comes from the label (falling back to `metadata.name`) and `image` from the first container. Status rules are in [../routes/README.md](../routes/README.md#get-apps). |
