import type { AuditDetailValue, AuditEntry } from "../api/types";

const ACTION_LABELS: Record<string, string> = {
  "app.create": "Deployed app",
  "app.update": "Changed settings",
  "app.scale": "Scaled",
  "app.restart": "Restarted",
  "app.delete": "Deleted app",
  "pod.delete": "Restarted pod",
  "volume.create": "Created volume",
  "volume.delete": "Deleted volume",
  "session.login": "Signed in",
};

/** Human label for an audit action; unknown actions show as-is. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const DETAIL_LABELS: Record<string, string> = {
  envKeys: "env",
  deleteVolumes: "delete volumes",
};

function formatValue(value: AuditDetailValue): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** One-line summary of an entry's details, e.g. "image nginx:1.27 · replicas 2 · env API_KEY". */
export function formatDetails(details: AuditEntry["details"]): string {
  return Object.entries(details)
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key} ${formatValue(value)}`)
    .join(" · ");
}
