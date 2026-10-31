import type { AppsV1Api, CoreV1Api, V1Pod } from "@kubernetes/client-node";
import { appSelector } from "./labels.js";
import { apiStatusCode } from "./api-errors.js";

/** One app pod with waiting and termination reason information. */
export type AppPod = {
  name: string;
  phase: string;
  ready: boolean;
  readyContainers: string;
  restarts: number;
  node?: string;
  startedAt?: string;
  waitingReason?: string;
  lastTerminationReason?: string;
};

/**
 * Check if an app (Deployment) exists in the namespace.
 * Returns true if found, false if 404, rethrows other errors.
 */
export async function appExists(
  apps: AppsV1Api,
  namespace: string,
  name: string,
): Promise<boolean> {
  try {
    await apps.readNamespacedDeployment({ namespace, name });
    return true;
  } catch (err) {
    const code = apiStatusCode(err);
    if (code === 404) {
      return false;
    }
    // Rethrow other errors (permissions, network, etc.)
    throw err;
  }
}

/**
 * Derive ready state from container statuses.
 * Returns true if all containers in the pod are ready.
 */
function isReady(pod: V1Pod): boolean {
  const statuses = pod.status?.containerStatuses ?? [];
  if (statuses.length === 0) return false;
  return statuses.every((s) => s.ready);
}

/**
 * Format ready count for display (e.g., "1/2").
 */
function readyStr(pod: V1Pod): string {
  const statuses = pod.status?.containerStatuses ?? [];
  if (statuses.length === 0) return "0/0";
  const readyCount = statuses.filter((s) => s.ready).length;
  return `${readyCount}/${statuses.length}`;
}

/**
 * Sum restart counts across all containers in the pod.
 */
function restartCount(pod: V1Pod): number {
  const statuses = pod.status?.containerStatuses ?? [];
  return statuses.reduce((sum, s) => sum + (s.restartCount ?? 0), 0);
}

/**
 * Get waiting reason from the first container's waiting state (if any).
 */
function getWaitingReason(pod: V1Pod): string | undefined {
  const statuses = pod.status?.containerStatuses ?? [];
  for (const status of statuses) {
    if (status.state?.waiting?.reason) {
      return status.state.waiting.reason;
    }
  }
  return undefined;
}

/**
 * Get the most recent termination reason from any container's lastState.
 */
function getLastTerminationReason(pod: V1Pod): string | undefined {
  const statuses = pod.status?.containerStatuses ?? [];
  for (const status of statuses) {
    if (status.lastState?.terminated?.reason) {
      return status.lastState.terminated.reason;
    }
  }
  return undefined;
}

/**
 * Format pod startTime as ISO string if present.
 */
function formatStartTime(startTime?: Date): string | undefined {
  return startTime?.toISOString();
}

/**
 * Map a Kubernetes Pod to an AppPod summary.
 */
export function podToAppPod(pod: V1Pod): AppPod {
  return {
    name: pod.metadata?.name ?? "",
    phase: pod.status?.phase ?? "Unknown",
    ready: isReady(pod),
    readyContainers: readyStr(pod),
    restarts: restartCount(pod),
    node: pod.spec?.nodeName,
    startedAt: formatStartTime(pod.status?.startTime),
    waitingReason: getWaitingReason(pod),
    lastTerminationReason: getLastTerminationReason(pod),
  };
}

/**
 * List pods for a specific app in a namespace, newest (by startTime) first.
 * Returns empty array if app has no pods (e.g., scaled to 0 or pending).
 */
export async function listAppPods(
  core: CoreV1Api,
  namespace: string,
  appName: string,
): Promise<AppPod[]> {
  const response = await core.listNamespacedPod({
    namespace,
    labelSelector: appSelector(appName),
  });

  const pods = (response.items ?? []).map(podToAppPod);

  // Sort by startTime descending (newest first), falling back to name for stability.
  pods.sort((a, b) => {
    if (a.startedAt && b.startedAt) {
      return b.startedAt.localeCompare(a.startedAt);
    }
    if (a.startedAt) return -1;
    if (b.startedAt) return 1;
    return b.name.localeCompare(a.name);
  });

  return pods;
}
