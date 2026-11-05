import type { DatabaseSync } from "node:sqlite";
import { stepsForDeploy, type DeploySpec, type DeployTrigger, type LineLevel, type StepName, type StepStatus } from "../deploys/types.js";

/** Most output lines kept per deploy; one "more lines dropped" line follows the cap. */
export const DEPLOY_LOG_LINE_CAP = 300;
/** Longest stored line; longer text is cut with an ellipsis. */
export const DEPLOY_LOG_LINE_MAX = 1000;
const DROPPED_LINE = "… more lines dropped";

export type NewDeployment = { app: string; trigger: DeployTrigger; spec: DeploySpec; now: number; build?: boolean };

/** Insert a running deploy with every step pending, then start Validate. Returns its id. */
export function insertDeployment(db: DatabaseSync, input: NewDeployment): number {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare("INSERT INTO deployments (app, trigger, status, spec, started_at) VALUES (?, ?, 'running', ?, ?)")
      .run(input.app, input.trigger, JSON.stringify(input.spec), input.now);
    const id = Number(result.lastInsertRowid);
    const step = db.prepare("INSERT INTO deployment_steps (deployment_id, position, name, status) VALUES (?, ?, ?, 'pending')");
    stepsForDeploy({ build: input.build }).forEach((name, position) => step.run(id, position, name));
    setStepStatus(db, id, "validate", "running", input.now);
    db.exec("COMMIT");
    return id;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Move a step forward. Starting sets started_at; ending sets finished_at (a skipped step
 * that never started keeps both null). Steps never go backwards: an ended step is left
 * as it is. Returns true when the row changed.
 */
export function setStepStatus(db: DatabaseSync, id: number, step: StepName, status: StepStatus, now: number): boolean {
  if (status === "pending") return false;
  const result =
    status === "running"
      ? db
          .prepare("UPDATE deployment_steps SET status = 'running', started_at = COALESCE(started_at, ?) WHERE deployment_id = ? AND name = ? AND status = 'pending'")
          .run(now, id, step)
      : db
          .prepare(
            `UPDATE deployment_steps SET status = ?,
               started_at = CASE WHEN ? = 'skipped' THEN started_at ELSE COALESCE(started_at, ?) END,
               finished_at = CASE WHEN ? = 'skipped' AND started_at IS NULL THEN NULL ELSE ? END
             WHERE deployment_id = ? AND name = ? AND status IN ('pending', 'running')`,
          )
          .run(status, status, now, status, now, id, step);
  return Number(result.changes) > 0;
}

export type NewLine = { deploymentId: number; step: string; level: LineLevel; text: string; ts: number; eventKey?: string };

/** Add an output line. Duplicate event keys are ignored. Returns true when a row was added. */
export function appendLog(db: DatabaseSync, line: NewLine): boolean {
  const count = Number(
    db.prepare("SELECT COUNT(*) AS n FROM deployment_logs WHERE deployment_id = ?").get(line.deploymentId)?.n ?? 0,
  );
  if (count > DEPLOY_LOG_LINE_CAP) return false;
  const capped = count === DEPLOY_LOG_LINE_CAP;
  const text = capped ? DROPPED_LINE : line.text.length > DEPLOY_LOG_LINE_MAX ? `${line.text.slice(0, DEPLOY_LOG_LINE_MAX - 1)}…` : line.text;
  const result = db
    .prepare("INSERT OR IGNORE INTO deployment_logs (deployment_id, step, ts, level, text, event_key) VALUES (?, ?, ?, ?, ?, ?)")
    .run(line.deploymentId, line.step, line.ts, capped ? "info" : line.level, text, capped ? null : (line.eventKey ?? null));
  return Number(result.changes) > 0;
}

export function setDeploySpec(db: DatabaseSync, id: number, spec: DeploySpec): void {
  db.prepare("UPDATE deployments SET spec = ? WHERE id = ?").run(JSON.stringify(spec), id);
}

export function setGeneration(db: DatabaseSync, id: number, generation: number): void {
  db.prepare("UPDATE deployments SET generation = ? WHERE id = ?").run(generation, id);
}

export function deleteDeployment(db: DatabaseSync, id: number): void {
  db.prepare("DELETE FROM deployments WHERE id = ?").run(id);
}

export type Finish = { status: "succeeded" | "failed" | "cancelled"; reason: string | null; step?: StepName; now: number };

/** The step a failure belongs to: the named one unless it already ended, else the running one, else the first unfinished one. */
function failedStep(db: DatabaseSync, id: number, preferred?: StepName): string | undefined {
  const rows = db.prepare("SELECT name, status FROM deployment_steps WHERE deployment_id = ? ORDER BY position").all(id);
  const open = rows.filter((row) => row.status === "pending" || row.status === "running");
  if (preferred && open.some((row) => row.name === preferred)) return preferred;
  const running = open.find((row) => row.status === "running");
  return String((running ?? open[0])?.name ?? "") || undefined;
}

/**
 * End a running deploy. failed: the failing step turns failed and the remaining
 * steps skipped; succeeded and cancelled: unfinished steps are skipped. Returns false
 * (and changes nothing) when the deploy is not running.
 */
export function finishDeployment(db: DatabaseSync, id: number, finish: Finish): boolean {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare("UPDATE deployments SET status = ?, reason = ?, finished_at = ? WHERE id = ? AND status = 'running'")
      .run(finish.status, finish.reason, finish.now, id);
    if (Number(result.changes) === 0) {
      db.exec("ROLLBACK");
      return false;
    }
    if (finish.status === "failed") {
      const step = failedStep(db, id, finish.step);
      if (step) {
        db.prepare(
          "UPDATE deployment_steps SET status = 'failed', started_at = COALESCE(started_at, ?), finished_at = ? WHERE deployment_id = ? AND name = ?",
        ).run(finish.now, finish.now, id, step);
      }
    }
    db.prepare(
      "UPDATE deployment_steps SET status = 'skipped', finished_at = CASE WHEN started_at IS NULL THEN NULL ELSE ? END WHERE deployment_id = ? AND status IN ('pending', 'running')",
    ).run(finish.now, id);
    db.exec("COMMIT");
    return true;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
