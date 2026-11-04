import type { V1ContainerStatus, V1Deployment, V1Pod, V1ReplicaSet } from "@kubernetes/client-node";
import { reasons } from "./reasons.js";
import type { StepName } from "./types.js";

/** A failure seen in the cluster and the step it naturally belongs to. */
export type Failure = { step: StepName | "current"; reason: string };

export const UNSCHEDULABLE_GRACE_MS = 60_000;
const PULL_FAILURES = new Set(["ImagePullBackOff", "InvalidImageName", "ErrImageNeverPull"]);
const CREATE_FAILURES = new Set(["CreateContainerConfigError", "CreateContainerError"]);

/** The `app` container's status (Pier apps have one container), or the first one. */
export function appContainer(pod: V1Pod): V1ContainerStatus | undefined {
  const statuses = pod.status?.containerStatuses ?? [];
  return statuses.find((s) => s.name === "app") ?? statuses[0];
}

function memoryLimit(pod: V1Pod): string | undefined {
  const containers = pod.spec?.containers ?? [];
  const container = containers.find((c) => c.name === "app") ?? containers[0];
  return container?.resources?.limits?.memory;
}

function ms(value: Date | string | undefined): number | undefined {
  if (!value) return undefined;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? undefined : t;
}

function podFailure(pod: V1Pod, now: number): Failure | undefined {
  const scheduled = (pod.status?.conditions ?? []).find((c) => c.type === "PodScheduled");
  if (scheduled?.status === "False" && scheduled.reason === "Unschedulable") {
    const since = ms(scheduled.lastTransitionTime) ?? ms(pod.metadata?.creationTimestamp) ?? now;
    if (now - since >= UNSCHEDULABLE_GRACE_MS) return { step: "schedule", reason: reasons.unschedulable(scheduled.message ?? "") };
  }
  const status = appContainer(pod);
  if (!status) return undefined;
  const waiting = status.state?.waiting;
  const waitingReason = waiting?.reason ?? "";
  if (PULL_FAILURES.has(waitingReason)) {
    return { step: "pull", reason: reasons.pull(status.image, waiting?.message ?? waitingReason) };
  }
  if (CREATE_FAILURES.has(waitingReason)) {
    return { step: "start", reason: reasons.createContainer(waiting?.message ?? waitingReason) };
  }
  const last = status.lastState?.terminated ?? status.state?.terminated;
  if (last?.reason === "OOMKilled" && !status.ready) return { step: "start", reason: reasons.oom(memoryLimit(pod)) };
  if (waitingReason === "CrashLoopBackOff") return { step: "start", reason: reasons.crashLoop(last?.exitCode) };
  return undefined;
}

function replicaSetFailure(rs: V1ReplicaSet | undefined): Failure | undefined {
  const failure = (rs?.status?.conditions ?? []).find((c) => c.type === "ReplicaFailure" && c.status === "True");
  if (!failure) return undefined;
  const message = failure.message ?? failure.reason ?? "unknown error";
  return {
    step: "schedule",
    reason: message.includes("exceeded quota") ? reasons.quota(message) : reasons.replicaFailure(message),
  };
}

function deploymentFailure(dep: V1Deployment): Failure | undefined {
  const progressing = (dep.status?.conditions ?? []).find((c) => c.type === "Progressing");
  if (progressing?.status === "False" && progressing.reason === "ProgressDeadlineExceeded") {
    return { step: "current", reason: reasons.progressDeadline() };
  }
  return undefined;
}

/** The first failure among the new ReplicaSet, its pods and the Deployment, if any. */
export function findFailure(dep: V1Deployment, rs: V1ReplicaSet | undefined, pods: V1Pod[], now: number): Failure | undefined {
  const fromRs = replicaSetFailure(rs);
  if (fromRs) return fromRs;
  for (const pod of pods) {
    const found = podFailure(pod, now);
    if (found) return found;
  }
  return deploymentFailure(dep);
}
