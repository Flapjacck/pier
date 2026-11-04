import type { CoreV1Event } from "@kubernetes/client-node";
import { summarizeEvent } from "../k8s/event-reasons.js";
import type { LineLevel, StepName } from "./types.js";

/** One output line derived from cluster state. `key` de-duplicates it across polls. */
export type InfoLine = { step: StepName; level: LineLevel; text: string; key: string; ts: number };

export type EventLineInput = {
  events: CoreV1Event[];
  /** UIDs of the Deployment, the new ReplicaSet and its pods. */
  uids: Set<string>;
  startedAt: number;
  current: StepName;
};

const SLACK_MS = 1000;

export function eventTime(event: CoreV1Event): number {
  const value = event.lastTimestamp ?? event.eventTime ?? event.firstTimestamp ?? event.metadata?.creationTimestamp;
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Which step an event reason belongs to (falls back to the running step). */
export function stepForEvent(reason: string, message: string, current: StepName): StepName {
  const lower = message.toLowerCase();
  switch (reason) {
    case "Scheduled":
    case "FailedScheduling":
    case "SuccessfulCreate":
    case "FailedCreate":
      return "schedule";
    case "Pulling":
    case "Pulled":
    case "ErrImagePull":
    case "ImagePullBackOff":
      return "pull";
    case "Failed":
    case "BackOff":
      return lower.includes("pull") || lower.includes("image") ? "pull" : "start";
    case "Created":
    case "Started":
    case "Killing":
      return "start";
    case "Unhealthy":
    case "ProbeWarning":
      return "health";
    case "ScalingReplicaSet":
      return "apply";
    default:
      return current;
  }
}

/** Turn this deploy's events (by involved-object UID, newer than the start) into lines, oldest first. */
export function eventLines(input: EventLineInput): InfoLine[] {
  return input.events
    .filter((event) => {
      const uid = event.involvedObject?.uid;
      return Boolean(uid && input.uids.has(uid)) && eventTime(event) >= input.startedAt - SLACK_MS;
    })
    .sort((a, b) => eventTime(a) - eventTime(b))
    .map((event): InfoLine => {
      const reason = event.reason ?? "Event";
      const message = event.message ?? "";
      const summary = summarizeEvent(reason, message);
      return {
        step: stepForEvent(reason, message, input.current),
        level: event.type === "Warning" ? "warning" : "info",
        text: summary ? `${summary} (${reason})` : `${reason}: ${message}`,
        key: `${event.metadata?.uid ?? `${reason}-${eventTime(event)}`}:${event.count ?? 1}`,
        ts: eventTime(event),
      };
    });
}
