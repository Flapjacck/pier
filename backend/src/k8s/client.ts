import fs from "node:fs";
import * as k8s from "@kubernetes/client-node";

export type KubeConfigMode = "in-cluster" | "kubeconfig";

const SA_TOKEN = "/var/run/secrets/kubernetes.io/serviceaccount/token";

/** True when running as a pod with the standard ServiceAccount volume mounted. */
export function isInCluster(): boolean {
  return (
    Boolean(process.env.KUBERNETES_SERVICE_HOST) &&
    fs.existsSync(SA_TOKEN)
  );
}

/**
 * Load and validate kubeconfig once, with clear error messages if it fails.
 * Tries in order: in-cluster (if token/env mounted), then kubeconfig file (if path given),
 * then default locations (~/.kube/config).
 * Throws if the loaded config has no current context or cluster.
 */
export function loadKubeConfig(
  kubeconfigPath?: string,
): { kc: k8s.KubeConfig; mode: KubeConfigMode } {
  const kc = new k8s.KubeConfig();

  if (isInCluster()) {
    kc.loadFromCluster();
  } else if (kubeconfigPath) {
    kc.loadFromFile(kubeconfigPath);
  } else {
    kc.loadFromDefault();
  }

  // Validate that the loaded config has a current context and cluster.
  const currentContext = kc.getCurrentContext();
  if (!currentContext) {
    throw new Error(
      "kubeconfig: no current context found; check your KUBECONFIG or ~/.kube/config",
    );
  }

  const cluster = kc.getCluster(currentContext);
  if (!cluster) {
    throw new Error(
      `kubeconfig: cluster "${currentContext}" not found in config`,
    );
  }

  const mode = isInCluster() ? "in-cluster" : "kubeconfig";
  return { kc, mode };
}
