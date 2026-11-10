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
  "app.redeploy": "Redeployed",
  "deploy.succeeded": "Deploy succeeded",
  "deploy.failed": "Deploy failed",
  "deploy.cancelled": "Deploy cancelled",
  "git-credential.create": "Added git credential",
  "git-credential.update": "Changed git credential",
  "git-credential.delete": "Deleted git credential",
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

/**
 * Where an entry's target should link. Deploy outcome rows (#83) target a deploy id,
 * so a failed build in Activity always opens its durable deploy page and logs.
 */
export function targetHref(entry: Pick<AuditEntry, "action" | "app" | "target">): string | undefined {
  if (!entry.action.startsWith("deploy.") || !entry.app || !entry.target || !/^\d+$/.test(entry.target)) return undefined;
  return `/apps/${encodeURIComponent(entry.app)}/deployments/${entry.target}`;
}

/** "Pier" for background rows (no request, so no IP); otherwise "token · 1.2.3.4". */
export function actorLabel(entry: Pick<AuditEntry, "actor" | "ip">): string {
  if (entry.actor === "pier") return "Pier";
  return entry.ip ? `${entry.actor} · ${entry.ip}` : entry.actor;
}

/** One-line summary of an entry's details, e.g. "image nginx:1.27 · replicas 2 · env API_KEY". */
export function formatDetails(details: AuditEntry["details"]): string {
  return Object.entries(details)
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key} ${formatValue(value)}`)
    .join(" · ");
}
