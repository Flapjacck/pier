import type { FieldErrors } from "../../lib/deployValidation";

/** Deploy wizard steps (#83). Pre-built images have nothing to build, so they skip Build method. */
export type StepId = "app" | "source" | "connect" | "build" | "runtime" | "review";
export type SourceKind = "image" | "repo";

export const STEP_LABELS: Record<StepId, string> = {
  app: "App",
  source: "Source",
  connect: "Connect",
  build: "Build method",
  runtime: "Runtime",
  review: "Review",
};

export function stepsFor(kind: SourceKind): StepId[] {
  return kind === "image"
    ? ["app", "source", "connect", "runtime", "review"]
    : ["app", "source", "connect", "build", "runtime", "review"];
}

/** Which validation errors block leaving each step. Review checks everything. */
const STEP_FIELDS: Record<Exclude<StepId, "review">, (keyof FieldErrors)[]> = {
  app: ["name"],
  source: [],
  connect: ["image", "repo"],
  build: ["folder", "dockerfile"],
  runtime: ["port", "replicas", "resources", "volume", "host", "env"],
};

export function errorsForStep(errors: FieldErrors, step: StepId): FieldErrors {
  if (step === "review") return errors;
  const picked: FieldErrors = {};
  for (const key of STEP_FIELDS[step]) {
    if (errors[key] !== undefined) Object.assign(picked, { [key]: errors[key] });
  }
  return picked;
}

/** First step that owns one of these errors, so a failed Deploy sends you back to fix it. */
export function firstStepWithError(errors: FieldErrors, steps: StepId[]): StepId {
  return steps.find((step) => step !== "review" && Object.keys(errorsForStep(errors, step)).length > 0) ?? "review";
}
