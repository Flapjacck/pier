import type { DeployStatus } from "../types/app";

/** Tailwind utility classes for a deploy status (full literals for the compiler). */
export interface StatusClasses {
  text: string;
  background: string;
  icon: string;
  label: string;
}

const STATUS_MAP: Record<DeployStatus, StatusClasses> = {
  running: {
    text: "text-pier-status-running",
    background: "bg-pier-status-running-bg",
    icon: "text-pier-status-running-icon",
    label: "running",
  },
  building: {
    text: "text-pier-status-building",
    background: "bg-pier-status-building-bg",
    icon: "text-pier-status-building-icon",
    label: "building",
  },
  failed: {
    text: "text-pier-status-failed",
    background: "bg-pier-status-failed-bg",
    icon: "text-pier-status-failed-icon",
    label: "failed",
  },
  stopped: {
    text: "text-pier-status-stopped",
    background: "bg-pier-status-stopped-bg",
    icon: "text-pier-status-stopped-icon",
    label: "stopped",
  },
};

export function getStatusClasses(status: DeployStatus): StatusClasses {
  return STATUS_MAP[status];
}
