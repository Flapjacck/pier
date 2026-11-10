import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import {
  DEPLOY_STATUSES,
  DEPLOY_TRIGGERS,
  STEP_STATUSES,
  isStepName,
  type DeploySpec,
  type DeployStatus,
  type DeployTrigger,
  type LineLevel,
  type StepName,
  type StepStatus,
} from "../deploys/types.js";

export type DeployRow = {
  id: number;
  app: string;
  trigger: DeployTrigger;
  status: DeployStatus;
  spec: DeploySpec;
  reason: string | null;
  generation: number | null;
  startedAt: number;
  finishedAt: number | null;
  /** The running step, or the failed one; null when neither. */
  currentStep: StepName | null;
};

export type LineRow = { step: string; ts: number; level: LineLevel; text: string };
export type StepRow = { name: StepName; status: StepStatus; startedAt: number | null; finishedAt: number | null; lines: LineRow[] };
export type DeployDetailRow = DeployRow & { steps: StepRow[] };

export type DeployPageRows = { items: DeployRow[]; nextBefore: number | null };

type Row = Record<string, SQLOutputValue>;

const SELECT = `SELECT d.*, (SELECT name FROM deployment_steps s WHERE s.deployment_id = d.id
  AND s.status IN ('running', 'failed') ORDER BY s.position LIMIT 1) AS current_step FROM deployments d`;

function oneOf<T extends string>(values: readonly T[], raw: SQLOutputValue, fallback: T): T {
  return values.find((value) => value === raw) ?? fallback;
}

function nullableNumber(raw: SQLOutputValue): number | null {
  return raw === null || raw === undefined ? null : Number(raw);
}

function parseSpec(raw: SQLOutputValue): DeploySpec {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as DeploySpec) : {};
  } catch {
    return {};
  }
}

function toRow(row: Row): DeployRow {
  const step = typeof row.current_step === "string" && isStepName(row.current_step) ? row.current_step : null;
  return {
    id: Number(row.id),
    app: String(row.app),
    trigger: oneOf(DEPLOY_TRIGGERS, row.trigger, "patch"),
    status: oneOf(DEPLOY_STATUSES, row.status, "failed"),
    spec: parseSpec(row.spec),
    reason: typeof row.reason === "string" ? row.reason : null,
    generation: nullableNumber(row.generation),
    startedAt: Number(row.started_at),
    finishedAt: nullableNumber(row.finished_at),
    currentStep: step,
  };
}

/** One deploy with its steps (in order) and each step's output lines (oldest first). */
export function getDeployment(db: DatabaseSync, id: number): DeployDetailRow | undefined {
  const row = db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
  if (!row) return undefined;
  const lines = db
    .prepare("SELECT step, ts, level, text FROM deployment_logs WHERE deployment_id = ? ORDER BY id")
    .all(id)
    .map((line) => ({
      step: String(line.step),
      ts: Number(line.ts),
      level: oneOf<LineLevel>(["info", "warning", "error"], line.level, "info"),
      text: String(line.text),
    }));
  const steps = db
    .prepare("SELECT name, status, started_at, finished_at FROM deployment_steps WHERE deployment_id = ? ORDER BY position")
    .all(id)
    .flatMap((step): StepRow[] => {
      const name = String(step.name);
      if (!isStepName(name)) return [];
      return [{
        name,
        status: oneOf(STEP_STATUSES, step.status, "pending"),
        startedAt: nullableNumber(step.started_at),
        finishedAt: nullableNumber(step.finished_at),
        lines: lines.filter((line) => line.step === name),
      }];
    });
  return { ...toRow(row), steps };
}

export type ListDeploymentsOptions = { app: string; limit: number; before?: number };

/** Newest first. Pass nextBefore back as `before` for the next (older) page. */
export function listDeployments(db: DatabaseSync, opts: ListDeploymentsOptions): DeployPageRows {
  const rows = opts.before === undefined
    ? db.prepare(`${SELECT} WHERE d.app = ? ORDER BY d.id DESC LIMIT ?`).all(opts.app, opts.limit + 1)
    : db.prepare(`${SELECT} WHERE d.app = ? AND d.id < ? ORDER BY d.id DESC LIMIT ?`).all(opts.app, opts.before, opts.limit + 1);
  const items = rows.slice(0, opts.limit).map(toRow);
  const last = items[items.length - 1];
  return { items, nextBefore: rows.length > opts.limit && last ? last.id : null };
}

/** Every running deploy, oldest first (resumed at startup). */
export function listRunning(db: DatabaseSync): DeployRow[] {
  return db.prepare(`${SELECT} WHERE d.status = 'running' ORDER BY d.id`).all().map(toRow);
}

/** Running deploy ids for one app. */
export function runningIdsForApp(db: DatabaseSync, app: string): number[] {
  return db.prepare("SELECT id FROM deployments WHERE app = ? AND status = 'running' ORDER BY id").all(app).map((row) => Number(row.id));
}

/** Running deploys that haven't applied yet, i.e. still building (#83). A rollout being watched doesn't count. */
export function unappliedIdsForApp(db: DatabaseSync, app: string): number[] {
  return db
    .prepare(
      `SELECT d.id FROM deployments d JOIN deployment_steps s ON s.deployment_id = d.id AND s.name = 'apply'
       WHERE d.app = ? AND d.status = 'running' AND s.status IN ('pending', 'running') ORDER BY d.id`,
    )
    .all(app)
    .map((row) => Number(row.id));
}
