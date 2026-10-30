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
  core: k8s.CoreV1Api,
  version: k8s.VersionApi,
  mode: KubeConfigMode,
): Promise<ClusterHealth> {
  const versionInfo = await version.getCode();
  const versionStr = versionInfo.gitVersion;

  const nodeList = await core.listNode();
  const nodes = countReadyNodes(nodeList.items ?? []);

  const ok = nodes.total > 0 && nodes.ready === nodes.total;

  return { ok, mode, version: versionStr, nodes };
}
