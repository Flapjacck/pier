import type { AppStatus, DeployStatus, DeployTrigger } from "../api/types";

/** "0.4s", "12.3s", "1m 05s", "1h 02m". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const TRIGGER_LABELS: Record<DeployTrigger, string> = {
  create: "Create",
  patch: "Settings change",
  restart: "Restart",
  rollback: "Rollback",
  build: "Build",
};

export function triggerLabel(trigger: DeployTrigger): string {
  return TRIGGER_LABELS[trigger];
}

/** Reuse the app status colours and icons: running deploy = building, succeeded = running. */
const STATUS_TONES: Record<DeployStatus, AppStatus> = {
  running: "building",
  succeeded: "running",
  failed: "failed",
  cancelled: "stopped",
};

export function deployStatusTone(status: DeployStatus): AppStatus {
  return STATUS_TONES[status];
}

/** Toast text after a change that may have started a deploy. */
export function deployStartedText(deploymentId: number | undefined, fallback: string): string {
  return deploymentId === undefined ? fallback : `Deploy #${deploymentId} started`;
}

/** Where to go after a create: the live deploy, or the app when no record came back. */
export function deployRedirectPath(app: { name: string; deploymentId?: number }): string {
  const base = `/apps/${encodeURIComponent(app.name)}`;
  return app.deploymentId === undefined ? base : `${base}/deployments/${app.deploymentId}`;
}
