import type { DatabaseSync } from "node:sqlite";
import { insertAudit, type AuditDetails } from "../db/audit.js";
import { getDeployment } from "../db/deployments-read.js";
import type { DeployStatus } from "./types.js";

const ACTION: Record<Exclude<DeployStatus, "running">, string> = {
  succeeded: "deploy.succeeded",
  failed: "deploy.failed",
  cancelled: "deploy.cancelled",
};

/** HTTP-ish status for the Activity row, so filters and colours match request rows. */
const STATUS: Record<Exclude<DeployStatus, "running">, number> = { succeeded: 200, failed: 422, cancelled: 409 };

/**
 * Record an Activity row when a deploy ends (#83). Requests are audited when they
 * return, but a build or rollout finishes later in the background, and a failed build
 * is exactly what the user needs to find. target is the deploy id, so the row links to
 * /apps/<app>/deployments/<id>. Audit failures never break finishing a deploy.
 */
export function auditDeployFinished(db: DatabaseSync, id: number, now: number): void {
  try {
    const row = getDeployment(db, id);
    if (!row || row.status === "running") return;
    const details: AuditDetails = { trigger: row.trigger };
    if (row.reason) details.reason = row.reason;
    if (row.spec.source) {
      details.repo = row.spec.source.repo;
      details.branch = row.spec.source.branch;
      if (row.spec.source.commit) details.commit = row.spec.source.commit;
    }
    if (row.spec.image) details.image = row.spec.image;
    insertAudit(db, {
      ts: now,
      actor: "pier",
      ip: "",
      action: ACTION[row.status],
      app: row.app,
      target: String(row.id),
      status: STATUS[row.status],
      details,
    });
  } catch {
    // Activity is best-effort here; the deploy record itself is already saved.
  }
}
