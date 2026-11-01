export type ClusterHealthState = "online" | "unreachable" | "checking";

const DEBUG_KEY = "pier.debug.unreachable";

/** Dev-only: set localStorage pier.debug.unreachable=1 to simulate API down. */
function debugUnreachable(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Cluster health for the sidebar indicator.
 * TODO(#42): GET /api/cluster/health via typed API client.
 */
export async function getClusterHealth(): Promise<ClusterHealthState> {
  if (debugUnreachable()) return "unreachable";
  // TODO(#42): fetch /api/cluster/health; map 503/network to unreachable
  return "online";
}

export function clearClusterHealthDebug(): void {
  try {
    localStorage.removeItem(DEBUG_KEY);
  } catch { /* ignore */ }
}
