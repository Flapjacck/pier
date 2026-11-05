/** Shared deploy types (#81). Kept free of Kubernetes and SQLite imports. */

/** What started a deploy. rollback (#87) and build (#83) are reserved and not produced yet. */
export type DeployTrigger = "create" | "patch" | "restart" | "rollback" | "build";
export const DEPLOY_TRIGGERS: readonly DeployTrigger[] = ["create", "patch", "restart", "rollback", "build"];

export type DeployStatus = "running" | "succeeded" | "failed" | "cancelled";
export const DEPLOY_STATUSES: readonly DeployStatus[] = ["running", "succeeded", "failed", "cancelled"];

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export const STEP_STATUSES: readonly StepStatus[] = ["pending", "running", "succeeded", "failed", "skipped"];

export type LineLevel = "info" | "warning" | "error";

/**
 * Steps in order. A "build" step ("Build image") goes between validate and apply once
 * #83 adds builds; it is only inserted for deploys that build, so it is not listed here.
 */
export const STEP_NAMES = ["validate", "apply", "schedule", "pull", "start", "health", "ready"] as const;
export type StepName = (typeof STEP_NAMES)[number];

export const STEP_LABELS: Record<StepName, string> = {
  validate: "Validate",
  apply: "Apply resources",
  schedule: "Schedule pod",
  pull: "Pull image",
  start: "Start container",
  health: "Health check",
  ready: "Ready",
};

export function isStepName(value: string): value is StepName {
  return (STEP_NAMES as readonly string[]).includes(value);
}

/** What a deploy asked for. Env key names only: values can be secrets and are never stored. */
export type DeploySpec = {
  image?: string;
  port?: number;
  replicas?: number;
  host?: string;
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
  volumes?: { name: string; mountPath: string }[];
  registry?: string | null;
  envKeys?: string[];
};
