import type { DatabaseSync } from "node:sqlite";
import { insertAudit } from "../db/audit.js";
import { getDeployment } from "../db/deployments-read.js";
import type { DeployStatus } from "./types.js";

const ACTION: Record<Exclude<DeployStatus, "running">, string> = {
  succeeded: "deploy.succeeded",
  failed: "deploy.failed",
  cancelled: "deploy.cancelled",
};

/** Record Activity when a deploy ends (including failed Kaniko builds). */
export function auditDeployFinished(db: DatabaseSync, id: number, now: number): void {
  const row = getDeployment(db, id);
  if (!row || row.status === "running") return;
  const details: Record<string, string | number | boolean | string[]> = {
    trigger: row.trigger,
    status: row.status,
  };
  if (row.reason) details.reason = row.reason;
  if (row.spec.source?.repo) details.repo = row.spec.source.repo;
  if (row.spec.image) details.image = row.spec.image;
  try {
    insertAudit(db, {
      ts: now,
      actor: "session",
      ip: "pier",
      action: ACTION[row.status],
      app: row.app,
      target: String(row.id),
      status: row.status === "succeeded" ? 200 : row.status === "cancelled" ? 499 : 422,
      details,
    });
  } catch {
    // Never break deploy finishing on audit failure.
  }
}
