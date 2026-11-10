import type { V1ContainerStatus, V1Job, V1Pod } from "@kubernetes/client-node";
import type { BuildContainer } from "./job.js";

/**
 * Turn a build Job and its pod into one state for the Build step (#83). Pure, so the
 * mapping from Kubernetes status to a plain-language reason is unit tested.
 */
export type BuildState =
  | { phase: "pending" }
  | { phase: "running"; container: BuildContainer }
  | { phase: "succeeded" }
  | { phase: "failed"; container?: BuildContainer; reason: string };

export type BuildStatusInput = {
  job: V1Job | undefined;
  pod: V1Pod | undefined;
  repo: string;
  branch: string;
  gitCredential?: string;
  timeoutSeconds: number;
};

const PULL_ERRORS = new Set(["ErrImagePull", "ImagePullBackOff", "InvalidImageName"]);

function failureReason(container: BuildContainer, exitCode: number | undefined, input: BuildStatusInput): string {
  const code = exitCode === undefined ? "" : ` (exit code ${exitCode})`;
  switch (container) {
    case "fetch":
      return `Could not download the Railpack CLI${code}. The build pod needs HTTPS access to github.com.`;
    case "clone":
      return exitCode === 2
        ? `The folder was not found in ${input.repo} (${input.branch}).`
        : `Could not clone ${input.repo} (branch ${input.branch})${code}. Check the URL, the branch name and, for a private repo, the git credential.`;
    case "prepare":
      return `Railpack could not work out how to build this folder${code}. Check the folder, or switch to a Dockerfile build.`;
    case "build":
      return exitCode === 2
        ? "The Dockerfile was not found at the given path."
        : `The image build failed${code}. The builder output above shows the failing step.`;
  }
}

function waitingFailure(status: V1ContainerStatus, input: BuildStatusInput): string | undefined {
  const waiting = status.state?.waiting;
  if (!waiting?.reason) return undefined;
  if (PULL_ERRORS.has(waiting.reason)) return `Could not pull the build image ${status.image}: ${waiting.message ?? waiting.reason}`;
  if (waiting.reason === "CreateContainerConfigError") {
    return input.gitCredential
      ? `The git credential "${input.gitCredential}" could not be read (${waiting.message ?? "missing Secret"}).`
      : `The build container could not be configured: ${waiting.message ?? waiting.reason}`;
  }
  return undefined;
}

function statuses(pod: V1Pod | undefined): V1ContainerStatus[] {
  return [...(pod?.status?.initContainerStatuses ?? []), ...(pod?.status?.containerStatuses ?? [])];
}

function asContainer(name: string): BuildContainer | undefined {
  return name === "fetch" || name === "clone" || name === "prepare" || name === "build" ? name : undefined;
}

export function buildState(input: BuildStatusInput): BuildState {
  const { job, pod } = input;
  if (!job) return { phase: "failed", reason: "The build Job disappeared before it finished." };
  for (const status of statuses(pod)) {
    const container = asContainer(status.name);
    if (!container) continue;
    const terminated = status.state?.terminated;
    if (terminated && terminated.exitCode !== 0) {
      return { phase: "failed", container, reason: failureReason(container, terminated.exitCode, input) };
    }
    const waiting = waitingFailure(status, input);
    if (waiting) return { phase: "failed", container, reason: waiting };
  }
  const conditions = job.status?.conditions ?? [];
  if (conditions.some((c) => c.type === "Complete" && c.status === "True")) return { phase: "succeeded" };
  const failed = conditions.find((c) => c.type === "Failed" && c.status === "True");
  if (failed) {
    const reason = failed.reason === "DeadlineExceeded"
      ? `The build took longer than ${Math.round(input.timeoutSeconds / 60)} minutes and was stopped.`
      : `The build Job failed: ${failed.message ?? failed.reason ?? "unknown reason"}`;
    return { phase: "failed", reason };
  }
  if (pod?.status?.phase === "Failed") return { phase: "failed", reason: `The build pod failed: ${pod.status.message ?? pod.status.reason ?? "unknown reason"}` };
  const running = statuses(pod).find((s) => s.state?.running);
  const container = running ? asContainer(running.name) : undefined;
  return container ? { phase: "running", container } : { phase: "pending" };
}

/** Containers whose logs can be read now (started at least once), in run order. */
export function readableContainers(pod: V1Pod | undefined, order: readonly BuildContainer[]): BuildContainer[] {
  const started = new Set(statuses(pod).filter((s) => s.state?.running || s.state?.terminated).map((s) => s.name));
  return order.filter((name) => started.has(name));
}

/** True once a container has exited, so its log will not grow any more. */
export function containerDone(pod: V1Pod | undefined, name: BuildContainer): boolean {
  return statuses(pod).some((s) => s.name === name && s.state?.terminated !== undefined);
}
