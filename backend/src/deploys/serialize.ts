import type { DeployDetailRow, DeployRow, StepRow } from "../db/deployments-read.js";
import { STEP_LABELS, type DeploySpec, type DeployStatus, type DeployTrigger, type LineLevel, type StepName, type StepStatus } from "./types.js";

export type DeploySummary = {
  id: number;
  app: string;
  trigger: DeployTrigger;
  status: DeployStatus;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  spec: DeploySpec;
  currentStep: StepName | null;
};

export type DeployStepView = {
  name: StepName;
  label: string;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  lines: { ts: string; level: LineLevel; text: string }[];
};

export type DeployDetail = DeploySummary & { steps: DeployStepView[] };

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const duration = (start: number | null, end: number | null): number | null =>
  start === null || end === null ? null : Math.max(0, end - start);

export function toDeploySummary(row: DeployRow): DeploySummary {
  return {
    id: row.id,
    app: row.app,
    trigger: row.trigger,
    status: row.status,
    reason: row.reason,
    startedAt: new Date(row.startedAt).toISOString(),
    finishedAt: iso(row.finishedAt),
    durationMs: duration(row.startedAt, row.finishedAt),
    spec: row.spec,
    currentStep: row.currentStep,
  };
}

function toStep(step: StepRow): DeployStepView {
  return {
    name: step.name,
    label: STEP_LABELS[step.name],
    status: step.status,
    startedAt: iso(step.startedAt),
    finishedAt: iso(step.finishedAt),
    durationMs: duration(step.startedAt, step.finishedAt),
    lines: step.lines.map((line) => ({ ts: new Date(line.ts).toISOString(), level: line.level, text: line.text })),
  };
}

/** One shape for GET /deployments/:id and the SSE stream. */
export function toDeployDetail(row: DeployDetailRow): DeployDetail {
  return { ...toDeploySummary(row), steps: row.steps.map(toStep) };
}
