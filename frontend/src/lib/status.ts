import type { DeployStatus } from "../types/app";

/**
 * Maps a DeployStatus to the CSS variable names for colour and background.
 * All values reference semantic tokens from tokens.css so they auto-switch
 * for light/dark without any JS.
 */
export interface StatusTokens {
  color: string;
  iconColor: string;
  background: string;
  /** Path under /status/ in public */
  icon: string;
  label: string;
}

const STATUS_MAP: Record<DeployStatus, StatusTokens> = {
  running: {
    color:      "var(--pier-status-running)",
    iconColor:  "var(--pier-status-running-icon)",
    background: "var(--pier-status-running-bg)",
    icon:       "/status/status-running.svg",
    label:      "running",
  },
  building: {
    color:      "var(--pier-status-building)",
    iconColor:  "var(--pier-status-building-icon)",
    background: "var(--pier-status-building-bg)",
    icon:       "/status/status-building.svg",
    label:      "building",
  },
  failed: {
    color:      "var(--pier-status-failed)",
    iconColor:  "var(--pier-status-failed-icon)",
    background: "var(--pier-status-failed-bg)",
    icon:       "/status/status-failed.svg",
    label:      "failed",
  },
  stopped: {
    color:      "var(--pier-status-stopped)",
    iconColor:  "var(--pier-status-stopped-icon)",
    background: "var(--pier-status-stopped-bg)",
    icon:       "/status/status-stopped.svg",
    label:      "stopped",
  },
  queued: {
    color:      "var(--pier-status-queued)",
    iconColor:  "var(--pier-status-queued-icon)",
    background: "var(--pier-status-queued-bg)",
    icon:       "/status/status-queued.svg",
    label:      "queued",
  },
};

export function getStatusTokens(status: DeployStatus): StatusTokens {
  return STATUS_MAP[status];
}
