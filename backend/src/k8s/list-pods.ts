import * as k8s from "@kubernetes/client-node";
import type { KubeConfigMode } from "./client";

/** One row for the API — enough for a dashboard table without shipping full Pod specs. */
export type PodSummary = {
  name: string;
  namespace: string;
  phase: string;
  nodeName?: string;
  /** e.g. "2/2" from Ready conditions vs container count */
  ready: string;
  startedAt?: string;
};

export type ClusterPodsResult = {
  ok: boolean;
  mode: KubeConfigMode;
  pods?: PodSummary[];
  total?: number;
  error?: string;
};

/** Derive "ready/total" from status.containerStatuses (matches kubectl READY column). */
export function readyColumn(pod: k8s.V1Pod): string {
  const statuses = pod.status?.containerStatuses ?? [];
  if (statuses.length === 0) return "0/0";
  const readyCount = statuses.filter((s) => s.ready).length;
  return `${readyCount}/${statuses.length}`;
}

export function podToSummary(pod: k8s.V1Pod): PodSummary {
  return {
    name: pod.metadata?.name ?? "",
    namespace: pod.metadata?.namespace ?? "",
    phase: pod.status?.phase ?? "Unknown",
    nodeName: pod.spec?.nodeName,
    ready: readyColumn(pod),
    startedAt: pod.status?.startTime,
  };
}

/** Lists every pod in the cluster (all namespaces). Requires list pods RBAC in-cluster. */
export async function listClusterPods(
  kc: k8s.KubeConfig,
  mode: KubeConfigMode,
): Promise<ClusterPodsResult> {
  try {
    const core = kc.makeApiClient(k8s.CoreV1Api);
    const list = await core.listPodForAllNamespaces();
    const pods = (list.items ?? []).map(podToSummary);

    return { ok: true, mode, pods, total: pods.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, mode, error: message };
  }
}
