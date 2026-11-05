import { isRecord } from "./guards";
import type {
  DeployDetail,
  DeployLine,
  DeployPage,
  DeploySpec,
  DeployStatus,
  DeployStep,
  DeployStepName,
  DeployStepStatus,
  DeploySummary,
  DeployTrigger,
  RestartResult,
} from "./types";

const TRIGGERS: readonly DeployTrigger[] = ["create", "patch", "restart", "rollback", "build"];
const STATUSES: readonly DeployStatus[] = ["running", "succeeded", "failed", "cancelled"];
const STEP_STATUSES: readonly DeployStepStatus[] = ["pending", "running", "succeeded", "failed", "skipped"];
const STEP_NAMES: readonly DeployStepName[] = ["validate", "build", "apply", "schedule", "pull", "start", "health", "ready"];
const LEVELS: readonly DeployLine["level"][] = ["info", "warning", "error"];

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === "string";
const isNullableNumber = (v: unknown): v is number | null => v === null || typeof v === "number";

/** Spec fields of an unexpected type are dropped, not fatal (it is display-only). */
function parseSpec(value: unknown): DeploySpec {
  if (!isRecord(value)) return {};
  const spec: DeploySpec = {};
  if (typeof value.image === "string") spec.image = value.image;
  if (typeof value.port === "number") spec.port = value.port;
  if (typeof value.replicas === "number") spec.replicas = value.replicas;
  if (typeof value.host === "string") spec.host = value.host;
  if (Array.isArray(value.envKeys) && value.envKeys.every((k) => typeof k === "string")) spec.envKeys = value.envKeys;
  return spec;
}

export function parseDeploySummary(json: unknown): DeploySummary {
  if (
    !isRecord(json) ||
    typeof json.id !== "number" ||
    typeof json.app !== "string" ||
    !oneOf(TRIGGERS, json.trigger) ||
    !oneOf(STATUSES, json.status) ||
    !isNullableString(json.reason) ||
    typeof json.startedAt !== "string" ||
    !isNullableString(json.finishedAt) ||
    !isNullableNumber(json.durationMs) ||
    (json.currentStep !== null && !oneOf(STEP_NAMES, json.currentStep))
  ) {
    throw new SyntaxError("Invalid deployment");
  }
  return {
    id: json.id,
    app: json.app,
    trigger: json.trigger,
    status: json.status,
    reason: json.reason,
    startedAt: json.startedAt,
    finishedAt: json.finishedAt,
    durationMs: json.durationMs,
    spec: parseSpec(json.spec),
    currentStep: json.currentStep,
  };
}

function parseLine(json: unknown): DeployLine {
  if (!isRecord(json) || typeof json.ts !== "string" || !oneOf(LEVELS, json.level) || typeof json.text !== "string") {
    throw new SyntaxError("Invalid deployment line");
  }
  return { ts: json.ts, level: json.level, text: json.text };
}

function parseStep(json: unknown): DeployStep {
  if (
    !isRecord(json) ||
    !oneOf(STEP_NAMES, json.name) ||
    typeof json.label !== "string" ||
    !oneOf(STEP_STATUSES, json.status) ||
    !isNullableString(json.startedAt) ||
    !isNullableString(json.finishedAt) ||
    !isNullableNumber(json.durationMs) ||
    !Array.isArray(json.lines)
  ) {
    throw new SyntaxError("Invalid deployment step");
  }
  return {
    name: json.name,
    label: json.label,
    status: json.status,
    startedAt: json.startedAt,
    finishedAt: json.finishedAt,
    durationMs: json.durationMs,
    lines: json.lines.map(parseLine),
  };
}

/** A deploy with its steps: the `deployment` object of GET …/deployments/:id and each SSE frame. */
export function parseDeployDetail(json: unknown): DeployDetail {
  if (!isRecord(json) || !Array.isArray(json.steps)) throw new SyntaxError("Invalid deployment");
  return { ...parseDeploySummary(json), steps: json.steps.map(parseStep) };
}

/** GET /api/apps/:name/deployments/:id body. */
export function parseDeployResponse(json: unknown): DeployDetail {
  if (!isRecord(json) || json.ok !== true) throw new SyntaxError("Invalid deployment response");
  return parseDeployDetail(json.deployment);
}

export function parseDeployPage(json: unknown): DeployPage {
  if (
    !isRecord(json) ||
    json.ok !== true ||
    !Array.isArray(json.deployments) ||
    !isNullableNumber(json.nextBefore)
  ) {
    throw new SyntaxError("Invalid deployments response");
  }
  return { deployments: json.deployments.map(parseDeploySummary), nextBefore: json.nextBefore };
}

export function parseRestartResult(json: unknown): RestartResult {
  if (!isRecord(json) || json.ok !== true || typeof json.restartedAt !== "string") {
    throw new SyntaxError("Invalid restart response");
  }
  const result: RestartResult = { ok: true, restartedAt: json.restartedAt };
  if (typeof json.deploymentId === "number") result.deploymentId = json.deploymentId;
  return result;
}
