import type { V1Pod } from "@kubernetes/client-node";
import { eventLines, type InfoLine } from "./event-lines.js";
import { appContainer, findFailure } from "./failures.js";
import type { DeploySnapshot } from "./observe.js";
import { reasons } from "./reasons.js";
import { newPods, newReplicaSet, observed } from "./rollout.js";
import type { StepName } from "./types.js";

/** The steps the evaluator decides; validate and apply are recorded by the routes. */
export const CLUSTER_STEPS = ["schedule", "pull", "start", "health", "ready"] as const satisfies readonly StepName[];
type ClusterStep = (typeof CLUSTER_STEPS)[number];

export type EvaluateInput = {
  snapshot: DeploySnapshot;
  /** The Deployment generation this deploy applied; null until the first tick stores it. */
  generation: number | null;
  startedAt: number;
  now: number;
  timeoutMs: number;
};

export type Outcome = { status: "succeeded" | "failed" | "cancelled"; step: StepName; reason: string | null };

export type Evaluation = {
  generation: number | null;
  steps: Partial<Record<StepName, "running" | "succeeded" | "skipped">>;
  lines: InfoLine[];
  /** The first cluster step that has not succeeded (or `ready` when all have). */
  current: StepName;
  outcome?: Outcome;
};

function condition(pod: V1Pod, type: string): boolean {
  return (pod.status?.conditions ?? []).some((c) => c.type === type && c.status === "True");
}

const podChecks: Record<Exclude<ClusterStep, "ready">, (pod: V1Pod) => boolean> = {
  schedule: (pod) => condition(pod, "PodScheduled"),
  pull: (pod) => {
    const s = appContainer(pod);
    return Boolean(s?.imageID || s?.state?.running || s?.state?.terminated);
  },
  start: (pod) => {
    const s = appContainer(pod);
    return Boolean(s?.started || s?.state?.running);
  },
  health: (pod) => condition(pod, "Ready"),
};

function scheduledLines(pods: V1Pod[], now: number): InfoLine[] {
  return pods.flatMap((pod) => {
    const node = pod.spec?.nodeName;
    const uid = pod.metadata?.uid;
    if (!node || !uid || !podChecks.schedule(pod)) return [];
    return [{ step: "schedule", level: "info", text: `Scheduled on node ${node}`, key: `scheduled:${uid}`, ts: now }];
  });
}

/**
 * Decide where a deploy is from one cluster snapshot (pure). Failures are checked
 * before progress; a failure on a step that already succeeded moves to the first
 * step that has not.
 */
export function evaluateDeploy(input: EvaluateInput): Evaluation {
  const { snapshot, now } = input;
  const dep = snapshot.deployment;
  if (!dep) {
    return { generation: input.generation, steps: {}, lines: [], current: "schedule", outcome: { status: "cancelled", step: "schedule", reason: reasons.deleted() } };
  }
  const generation = input.generation ?? dep.metadata?.generation ?? null;
  const gen = generation ?? 0;
  const desired = dep.spec?.replicas ?? 1;
  const rs = newReplicaSet(snapshot, gen);
  const pods = newPods(snapshot, rs);
  const steps: Evaluation["steps"] = {};
  let current: ClusterStep | undefined;

  if (desired === 0) {
    for (const step of ["schedule", "pull", "start", "health"] as const) steps[step] = "skipped";
    const done = observed(dep, gen) && snapshot.pods.length === 0;
    if (done) steps.ready = "succeeded";
    else current = "ready";
  } else {
    for (const step of ["schedule", "pull", "start", "health"] as const) {
      if (pods.filter(podChecks[step]).length >= desired) steps[step] = "succeeded";
      else {
        current = step;
        break;
      }
    }
    if (!current) {
      const s = dep.status;
      const ready = observed(dep, gen) && (s?.updatedReplicas ?? 0) === desired && (s?.availableReplicas ?? 0) >= desired && (s?.replicas ?? 0) === desired;
      if (ready) steps.ready = "succeeded";
      else current = "ready";
    }
  }
  const at: StepName = current ?? "ready";
  if (current) steps[current] = "running";

  const uids = new Set<string>();
  for (const uid of [dep.metadata?.uid, rs?.metadata?.uid, ...pods.map((p) => p.metadata?.uid)]) if (uid) uids.add(uid);
  const lines = [...eventLines({ events: snapshot.events, uids, startedAt: input.startedAt, current: at }), ...scheduledLines(pods, now)];
  const base = { generation, steps, lines, current: at };

  if (!current) {
    lines.push({ step: "ready", level: "info", text: `${desired} of ${desired} replicas available.`, key: `ready:${gen}`, ts: now });
    return { ...base, outcome: { status: "succeeded", step: "ready", reason: null } };
  }
  const failure = observed(dep, gen) ? findFailure(dep, rs, pods, now) : undefined;
  if (failure) {
    const natural = failure.step === "current" ? at : failure.step;
    const step = steps[natural] === "succeeded" || steps[natural] === "skipped" ? at : natural;
    return { ...base, outcome: { status: "failed", step, reason: failure.reason } };
  }
  if (now - input.startedAt >= input.timeoutMs) {
    const lastWarning = [...lines].reverse().find((l) => l.level === "warning")?.text;
    return { ...base, outcome: { status: "failed", step: at, reason: reasons.timeout(input.timeoutMs, at, lastWarning) } };
  }
  return base;
}
