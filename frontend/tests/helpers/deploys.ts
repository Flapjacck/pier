import type { DeployDetail, DeployStep, DeploySummary } from "../../src/api/types";

export const recent = (msAgo = 60_000) => new Date(Date.now() - msAgo).toISOString();

export function summary(over: Partial<DeploySummary> = {}): DeploySummary {
  return {
    id: 1,
    app: "web",
    trigger: "create",
    status: "succeeded",
    reason: null,
    startedAt: recent(),
    finishedAt: recent(30_000),
    durationMs: 30_000,
    spec: { image: "nginx:1.27", envKeys: ["API_KEY"] },
    currentStep: null,
    ...over,
  };
}

export function step(over: Partial<DeployStep> & Pick<DeployStep, "name" | "label">): DeployStep {
  return { status: "succeeded", startedAt: null, finishedAt: null, durationMs: 1200, lines: [], ...over };
}

/** A deploy with all seven steps; `current` is running, earlier ones succeeded, later ones pending. */
export function detail(over: Partial<DeployDetail> = {}, current?: DeployStep["name"]): DeployDetail {
  const names: [DeployStep["name"], string][] = [
    ["validate", "Validate"], ["apply", "Apply resources"], ["schedule", "Schedule pod"], ["pull", "Pull image"],
    ["start", "Start container"], ["health", "Health check"], ["ready", "Ready"],
  ];
  const at = current ? names.findIndex(([n]) => n === current) : names.length;
  const steps = names.map(([name, label], i) =>
    step({
      name,
      label,
      status: i < at ? "succeeded" : i === at ? "running" : "pending",
      durationMs: i < at ? 1200 : null,
    }),
  );
  return { ...summary(current ? { status: "running", finishedAt: null, durationMs: null, currentStep: current } : {}), steps, ...over };
}
