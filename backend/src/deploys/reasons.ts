import { summarizeEvent } from "../k8s/event-reasons.js";
import { STEP_LABELS, type StepName } from "./types.js";

/** Plain-language failure reasons shown on the failed step (#81). */
export const reasons = {
  deleted: () => "The app was deleted.",
  superseded: (id: number) => `Superseded by deploy #${id}.`,
  quota: (msg: string) => `The namespace quota is full: ${msg}. Lower CPU/RAM in Settings or remove another app.`,
  replicaFailure: (msg: string) => `Kubernetes could not create the pod: ${msg}`,
  unschedulable: (msg: string) =>
    `No node can run the pod: ${summarizeEvent("FailedScheduling", msg) ?? msg}`,
  pull: (image: string, msg: string) =>
    `The image ${image} could not be pulled: ${msg}. Check the name and tag (and registry access).`,
  createContainer: (msg: string) => `The container could not be created: ${msg}`,
  oom: (limit: string | undefined) =>
    `OOMKilled: the app ran out of memory (limit ${limit ?? "not set"}). Raise the RAM limit in Settings.`,
  crashLoop: (exitCode: number | undefined) =>
    `The container keeps crashing (exit code ${exitCode ?? "unknown"}). Check the Logs tab.`,
  progressDeadline: () => "Kubernetes gave up waiting for the rollout (progress deadline exceeded).",
  restartedBeforeApply: () => "Pier restarted before the change was applied. Check Settings and deploy again.",
  timeout: (timeoutMs: number, step: StepName, lastWarning?: string) => {
    const detail = step === "health" ? ": the readiness check never passed" : "";
    const warning = lastWarning ? ` Last warning: ${lastWarning}` : "";
    return `Timed out after ${formatTimeout(timeoutMs)} waiting for ${STEP_LABELS[step]}${detail}.${warning}`;
  },
};

/** 300000 → "5m", 90000 → "1m 30s", 45000 → "45s". */
export function formatTimeout(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
