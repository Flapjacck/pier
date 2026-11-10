import type { DatabaseSync } from "node:sqlite";
import { appendLog, finishDeployment, rolloutStartedAt, setGeneration, setStepStatus, type Finish } from "../db/deployments.js";
import { getDeployment, type DeployRow } from "../db/deployments-read.js";
import type { K8sClientsResult } from "../k8s/clients.js";
import { auditDeployFinished } from "./audit-finish.js";
import { evaluateDeploy } from "./evaluate.js";
import { observeApp } from "./observe.js";
import { reasons } from "./reasons.js";
import { STEP_NAMES, type StepName } from "./types.js";

export type TrackerLog = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export type TickContext = {
  db: DatabaseSync;
  k8s: K8sClientsResult;
  namespace: string;
  timeoutMs: number;
  now: () => number;
};

export type TickResult = { changed: boolean; finished: boolean };

/** End a running deploy and record its outcome in Activity. Every finish goes through here. */
export function endDeploy(db: DatabaseSync, id: number, finish: Finish): boolean {
  const done = finishDeployment(db, id, finish);
  if (done) {
    if (finish.status === "failed" && finish.reason) {
      const failed = getDeployment(db, id)?.steps.find((s) => s.status === "failed")?.name ?? finish.step ?? "validate";
      appendLog(db, { deploymentId: id, step: failed, level: "error", text: finish.reason, ts: finish.now });
    }
    auditDeployFinished(db, id, finish.now);
  }
  return done;
}

/** End a deploy as failed and add the reason as an error line on the failed step. */
export function failDeploy(db: DatabaseSync, id: number, step: StepName, reason: string, now: number): boolean {
  return endDeploy(db, id, { status: "failed", reason, step, now });
}

/** Fail a deploy whose cluster could not be read once the timeout has passed. */
export function timeoutIfDue(ctx: TickContext, row: DeployRow): boolean {
  const now = ctx.now();
  const rollout = rolloutStartedAt(ctx.db, row.id, row.startedAt);
  // A running build has its own timeout (the build Job's deadline), not the rollout one.
  if (rollout === null || now - rollout < ctx.timeoutMs) return false;
  const step = row.currentStep ?? "schedule";
  return failDeploy(ctx.db, row.id, step, reasons.timeout(ctx.timeoutMs, step), now);
}

/**
 * One poll for one deploy: read the cluster, evaluate, and write step changes, lines
 * and the outcome. Throws when the cluster can't be read (the caller retries).
 */
export async function tick(ctx: TickContext, id: number, isActive: () => boolean): Promise<TickResult> {
  const row = getDeployment(ctx.db, id);
  if (!row || row.status !== "running") return { changed: false, finished: true };
  if (!ctx.k8s.ok) throw ctx.k8s.error;
  const snapshot = await observeApp(ctx.k8s.clients, ctx.namespace, row.app);
  if (!isActive()) return { changed: false, finished: true };
  const now = ctx.now();
  const startedAt = rolloutStartedAt(ctx.db, id, row.startedAt) ?? now;
  const ev = evaluateDeploy({ snapshot, generation: row.generation, startedAt, now, timeoutMs: ctx.timeoutMs });
  let changed = false;
  if (row.generation === null && ev.generation !== null) setGeneration(ctx.db, id, ev.generation);
  for (const step of STEP_NAMES) {
    const status = ev.steps[step];
    if (status && setStepStatus(ctx.db, id, step, status, now)) changed = true;
  }
  for (const line of ev.lines) {
    if (appendLog(ctx.db, { deploymentId: id, step: line.step, level: line.level, text: line.text, ts: line.ts || now, eventKey: line.key })) {
      changed = true;
    }
  }
  const outcome = ev.outcome;
  if (!outcome) return { changed, finished: false };
  const done =
    outcome.status === "failed"
      ? failDeploy(ctx.db, id, outcome.step, outcome.reason ?? "The deploy failed.", now)
      : endDeploy(ctx.db, id, { status: outcome.status, reason: outcome.reason, now });
  return { changed: changed || done, finished: true };
}
