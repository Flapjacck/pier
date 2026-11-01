import * as api from "../api/client";
import { ApiError } from "../api/errors";

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

/** Cluster reachability for the sidebar indicator (maps API health to online/unreachable). */
export async function getClusterHealth(): Promise<ClusterHealthState> {
  if (debugUnreachable()) return "unreachable";
  try {
    await api.getClusterHealth();
    return "online";
  } catch (err) {
    if (err instanceof ApiError && err.kind === "unauthorized") {
      throw err;
    }
    if (err instanceof ApiError && (err.kind === "unavailable" || err.kind === "network")) {
      return "unreachable";
    }
    return "unreachable";
  }
}

export function clearClusterHealthDebug(): void {
  try {
    localStorage.removeItem(DEBUG_KEY);
  } catch { /* ignore */ }
}
