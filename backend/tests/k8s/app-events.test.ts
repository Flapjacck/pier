import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppsV1Api, CoreV1Api } from "@kubernetes/client-node";
import { listAppEvents } from "../../src/k8s/app-events.js";
import { eventReasonDescription } from "../../src/k8s/event-reasons.js";

describe("listAppEvents", () => {
  it("provides descriptions for common warning reasons", () => {
    for (const reason of ["FailedScheduling", "BackOff", "Unhealthy", "OOMKilling", "Evicted", "FailedMount"]) {
      assert.equal(typeof eventReasonDescription(reason), "string");
    }
  });

  it("filters to workload objects and sorts newest first", async () => {
    const apps = {
      listNamespacedReplicaSet: async () => ({
        items: [{ metadata: { name: "hello-abc", uid: "rs-uid" } }],
      }),
    };
    const core = {
      listNamespacedPod: async () => ({
        items: [{ metadata: { name: "hello-pod", uid: "pod-uid" } }],
      }),
      listNamespacedEvent: async () => ({
        items: [
          {
            type: "Warning",
            reason: "FailedScheduling",
            message: "unschedulable",
            lastTimestamp: new Date("2026-11-01T10:00:00Z"),
            involvedObject: { kind: "Pod", name: "hello-pod", uid: "pod-uid" },
          },
          {
            type: "Warning",
            reason: "OOMKilling",
            message: "oom",
            lastTimestamp: new Date("2026-11-01T11:00:00Z"),
            count: 2,
            involvedObject: { kind: "Deployment", name: "hello", uid: "deploy-uid" },
          },
          {
            type: "Normal",
            reason: "Ignored",
            message: "other app",
            lastTimestamp: new Date("2026-11-01T12:00:00Z"),
            involvedObject: { kind: "Pod", name: "other-pod" },
          },
        ],
      }),
    };

    const events = await listAppEvents(
      core as never as CoreV1Api,
      apps as never as AppsV1Api,
      "pier-apps",
      { metadata: { name: "hello", uid: "deploy-uid" } },
    );
    assert.deepEqual(events.map((event) => event.reason), ["OOMKilling", "FailedScheduling"]);
    assert.equal(events[0]?.count, 2);
  });
});
