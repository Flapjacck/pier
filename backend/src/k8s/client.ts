import fs from "node:fs";
import * as k8s from "@kubernetes/client-node";

export type KubeConfigMode = "in-cluster" | "kubeconfig";

export type LoadedKubeConfig = { kc: k8s.KubeConfig; mode: KubeConfigMode };

/** Signature createK8sClients() and buildApp() accept, so tests can inject a fake loader. */
export type KubeConfigLoader = (kubeconfigPath?: string) => LoadedKubeConfig;

const SA_TOKEN = "/var/run/secrets/kubernetes.io/serviceaccount/token";

/**
 * True when running as a pod with the standard ServiceAccount volume mounted.
 * `pathPrefix` lets tests point at a fake ServiceAccount volume in a temp dir.
 */
export function isInCluster(pathPrefix = ""): boolean {
  return (
    Boolean(process.env.KUBERNETES_SERVICE_HOST) &&
    fs.existsSync(`${pathPrefix}${SA_TOKEN}`)
  );
}

/**
 * Load and validate the kubeconfig. Called once at startup by createK8sClients().
 * Order: in-cluster ServiceAccount, then the given file (config.kubeconfig),
 * then loadFromDefault() (KUBECONFIG env or ~/.kube/config).
 * Throws if there is no current context or it points at a missing cluster.
 */
export function loadKubeConfig(
  kubeconfigPath?: string,
  serviceAccountPathPrefix = "",
): LoadedKubeConfig {
  const kc = new k8s.KubeConfig();
  const inCluster = isInCluster(serviceAccountPathPrefix);

  if (inCluster) {
    kc.loadFromCluster(serviceAccountPathPrefix);
  } else if (kubeconfigPath) {
    kc.loadFromFile(kubeconfigPath);
  } else {
    kc.loadFromDefault();
  }

  const currentContext = kc.getCurrentContext();
  if (!currentContext) {
    throw new Error(
      "kubeconfig: no current context found; check your KUBECONFIG or ~/.kube/config",
    );
  }

  // Resolve the cluster through the context: context and cluster names often differ
  // (in-cluster they are "inClusterContext" and "inCluster").
  if (!kc.getCurrentCluster()) {
    throw new Error(
      `kubeconfig: context "${currentContext}" has no cluster; check the context's cluster entry`,
    );
  }

  return { kc, mode: inCluster ? "in-cluster" : "kubeconfig" };
}
