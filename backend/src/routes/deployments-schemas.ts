import { DEPLOY_STATUSES, DEPLOY_TRIGGERS, STEP_NAMES, STEP_STATUSES } from "../deploys/types.js";

const ALL_STEPS = ["build", ...STEP_NAMES] as const;

/** Response schemas for /apps/:name/deployments (#81). Fastify drops fields not listed here. */

const time = { type: "string", description: "ISO 8601" } as const;
const nullableTime = { type: ["string", "null"], description: "ISO 8601, or null" } as const;

const summaryProperties = {
  id: { type: "integer" },
  app: { type: "string" },
  trigger: { type: "string", enum: [...DEPLOY_TRIGGERS] },
  status: { type: "string", enum: [...DEPLOY_STATUSES] },
  reason: { type: ["string", "null"] },
  startedAt: time,
  finishedAt: nullableTime,
  durationMs: { type: ["integer", "null"] },
  spec: { type: "object", additionalProperties: true, description: "What the deploy asked for (env key names only)" },
  currentStep: { type: ["string", "null"], enum: [...ALL_STEPS, null] },
} as const;

const summaryRequired = [
  "id", "app", "trigger", "status", "reason", "startedAt", "finishedAt", "durationMs", "spec", "currentStep",
] as const;

export const deploySummarySchema = {
  type: "object",
  properties: summaryProperties,
  required: [...summaryRequired],
} as const;

const lineSchema = {
  type: "object",
  properties: { ts: time, level: { type: "string", enum: ["info", "warning", "error"] }, text: { type: "string" } },
  required: ["ts", "level", "text"],
} as const;

const stepSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    label: { type: "string" },
    status: { type: "string", enum: [...STEP_STATUSES] },
    startedAt: nullableTime,
    finishedAt: nullableTime,
    durationMs: { type: ["integer", "null"] },
    lines: { type: "array", items: lineSchema },
  },
  required: ["name", "label", "status", "startedAt", "finishedAt", "durationMs", "lines"],
} as const;

export const deployDetailSchema = {
  type: "object",
  properties: { ...summaryProperties, steps: { type: "array", items: stepSchema } },
  required: [...summaryRequired, "steps"],
} as const;
