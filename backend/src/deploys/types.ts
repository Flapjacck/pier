/** Shared deploy types (#81). Kept free of Kubernetes and SQLite imports. */

/** What started a deploy. "build" is a Redeploy from the saved git source (#83); rollback (#87) is reserved. */
export type DeployTrigger = "create" | "patch" | "restart" | "rollback" | "build";
export const DEPLOY_TRIGGERS: readonly DeployTrigger[] = ["create", "patch", "restart", "rollback", "build"];

export type DeployStatus = "running" | "succeeded" | "failed" | "cancelled";
export const DEPLOY_STATUSES: readonly DeployStatus[] = ["running", "succeeded", "failed", "cancelled"];

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export const STEP_STATUSES: readonly StepStatus[] = ["pending", "running", "succeeded", "failed", "skipped"];

export type LineLevel = "info" | "warning" | "error";

/**
 * Steps of an image deploy, in order. Deploys that build from git (#83) also get a
 * "build" step ("Build image") between validate and apply; see stepsForDeploy.
 */
export const STEP_NAMES = ["validate", "apply", "schedule", "pull", "start", "health", "ready"] as const;
export const ALL_STEP_NAMES = ["validate", "build", "apply", "schedule", "pull", "start", "health", "ready"] as const;
export type StepName = (typeof ALL_STEP_NAMES)[number];

export const STEP_LABELS: Record<StepName, string> = {
  validate: "Validate",
  build: "Build image",
  apply: "Apply resources",
  schedule: "Schedule pod",
  pull: "Pull image",
  start: "Start container",
  health: "Health check",
  ready: "Ready",
};

/** The steps a deploy records, in order. */
export function stepsForDeploy(build: boolean): StepName[] {
  return build ? [...ALL_STEP_NAMES] : [...STEP_NAMES];
}

export function isStepName(value: string): value is StepName {
  return (ALL_STEP_NAMES as readonly string[]).includes(value);
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
  /** Git source a build deploy built from (#83). Never carries credentials, only the name. */
  source?: {
    method: "railpack" | "dockerfile";
    repo: string;
    branch: string;
    folder: string;
    dockerfile?: string;
    gitCredential?: string;
    /** Commit that was built; set when the clone finishes. */
    commit?: string;
  };
};
