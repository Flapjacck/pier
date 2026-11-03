import type { AppsV1Api, CoreV1Api, V1Deployment } from "@kubernetes/client-node";
import { appSelector } from "./labels.js";
import { summarizeEvent } from "./event-reasons.js";

type K8sEvent = {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: Date | string;
  lastTimestamp?: Date | string;
  eventTime?: Date | string;
  metadata?: { creationTimestamp?: Date | string };
  involvedObject?: { uid?: string; kind?: string; name?: string };
};

export type AppEvent = {
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  summary?: string;
  object: { kind: string; name: string };
  count: number;
  firstSeen?: string;
  lastSeen?: string;
};

function iso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function eventDate(event: K8sEvent): number {
  const value = event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp;
  return value ? new Date(value).getTime() : 0;
}

function matchesReplacedPod(event: K8sEvent, replicaSetNames: Set<string>): boolean {
  if (event.involvedObject?.kind !== "Pod" || !event.involvedObject.name) return false;
  return [...replicaSetNames].some((name) => event.involvedObject?.name?.startsWith(`${name}-`));
}

function toAppEvent(event: K8sEvent): AppEvent | undefined {
  const kind = event.involvedObject?.kind;
  const name = event.involvedObject?.name;
  const reason = event.reason;
  const message = event.message;
  if (!kind || !name || !reason || !message) return undefined;
  const result: AppEvent = {
    type: event.type === "Warning" ? "Warning" : "Normal",
    reason,
    message,
    object: { kind, name },
    count: event.count ?? 1,
  };
  const summary = summarizeEvent(reason, message);
  if (summary) result.summary = summary;
  const firstSeen = iso(event.firstTimestamp);
  const lastSeen = iso(event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp);
  if (firstSeen) result.firstSeen = firstSeen;
  if (lastSeen) result.lastSeen = lastSeen;
  return result;
}

export async function listAppEvents(
  core: CoreV1Api,
  apps: AppsV1Api,
  namespace: string,
  deployment: V1Deployment,
  limit = 100,
): Promise<AppEvent[]> {
  const [replicaSets, pods, events] = await Promise.all([
    apps.listNamespacedReplicaSet({ namespace, labelSelector: appSelector(deployment.metadata?.name ?? "") }),
    core.listNamespacedPod({ namespace, labelSelector: appSelector(deployment.metadata?.name ?? "") }),
    core.listNamespacedEvent({ namespace }),
  ]);
  const uids = new Set<string>();
  if (deployment.metadata?.uid) uids.add(deployment.metadata.uid);
  const replicaSetNames = new Set<string>();
  for (const replicaSet of replicaSets.items ?? []) {
    if (replicaSet.metadata?.uid) uids.add(replicaSet.metadata.uid);
    if (replicaSet.metadata?.name) replicaSetNames.add(replicaSet.metadata.name);
  }
  for (const pod of pods.items ?? []) {
    if (pod.metadata?.uid) uids.add(pod.metadata.uid);
  }
  return (events.items ?? [])
    .map((event) => event as K8sEvent)
    .filter((event) => Boolean(event.involvedObject?.uid && uids.has(event.involvedObject.uid)) || matchesReplacedPod(event, replicaSetNames))
    .sort((a, b) => eventDate(b) - eventDate(a))
    .map(toAppEvent)
    .filter((event): event is AppEvent => event !== undefined)
    .slice(0, limit);
}
