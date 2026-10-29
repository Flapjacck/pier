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

/** Prefer in-cluster credentials in a pod; on Beater use KUBECONFIG / ~/.kube/config. */
export function loadKubeConfig(): { kc: k8s.KubeConfig; mode: KubeConfigMode } {
  const kc = new k8s.KubeConfig();

  if (isInCluster()) {
    kc.loadFromCluster();
    return { kc, mode: "in-cluster" };
  }

  kc.loadFromDefault();
  return { kc, mode: "kubeconfig" };
}
