import * as k8s from "@kubernetes/client-node";
import type { KubeConfigMode } from "./client";

export type ClusterHealth = {
  ok: boolean;
  mode: KubeConfigMode;
  version?: string;
  nodes?: { total: number; ready: number };
  error?: string;
};

function countReadyNodes(items: k8s.V1Node[]): { total: number; ready: number } {
  let ready = 0;
  for (const node of items) {
    const conditions = node.status?.conditions ?? [];
    const isReady = conditions.some(
      (c) => c.type === "Ready" && c.status === "True",
    );
    if (isReady) ready += 1;
  }
  return { total: items.length, ready };
}

/** Lightweight check: API /version plus node readiness (needs list nodes RBAC in-cluster). */
export async function getClusterHealth(
  kc: k8s.KubeConfig,
  mode: KubeConfigMode,
): Promise<ClusterHealth> {
  try {
    const versionApi = kc.makeApiClient(k8s.VersionApi);
    const versionInfo = await versionApi.getCode();
    const version = versionInfo.gitVersion;

    const core = kc.makeApiClient(k8s.CoreV1Api);
    const nodeList = await core.listNode();
    const nodes = countReadyNodes(nodeList.items ?? []);

    const ok = nodes.total > 0 && nodes.ready === nodes.total;

    return { ok, mode, version, nodes };
  } catch (err) {
    // Return the raw error for logging server-side; route will show generic message to client.
    throw err;
  }
}
