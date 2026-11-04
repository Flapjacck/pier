import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventLines, stepForEvent } from "../../src/deploys/event-lines.js";
import { event } from "../helpers/deploy-cluster.js";

const START = 1_000_000;

describe("eventLines", () => {
  it("keeps this deploy's events, oldest first, with summary text and keys", () => {
    const lines = eventLines({
      uids: new Set(["p1", "dep-uid"]),
      startedAt: START,
      current: "pull",
      events: [
        event({ uid: "e2", involved: "p1", reason: "Pulled", message: "pulled nginx", at: START + 20 }),
        event({ uid: "e1", involved: "p1", reason: "Scheduled", message: "assigned to node-a", at: START + 10 }),
        event({ uid: "e3", involved: "other-pod", reason: "Pulled", message: "x", at: START + 30 }),
        event({ uid: "e4", involved: "p1", reason: "Pulling", message: "old", at: START - 5000 }),
        event({ uid: "e5", involved: "p1", reason: "Custom", message: "something", at: START - 500 }),
        event({ uid: "e6", involved: "p1", reason: "BackOff", message: "Back-off pulling image", type: "Warning", at: START + 40, count: 3 }),
      ],
    });
    assert.deepEqual(lines.map((l) => [l.step, l.level, l.text, l.key]), [
      ["pull", "info", "Custom: something", "e5:1"],
      ["schedule", "info", "Kubernetes scheduled the pod. (Scheduled)", "e1:1"],
      ["pull", "info", "Kubernetes pulled the image. (Pulled)", "e2:1"],
      ["pull", "warning", "Kubernetes is backing off while pulling the image. (BackOff)", "e6:3"],
    ]);
  });
});

describe("stepForEvent", () => {
  it("maps reasons to steps", () => {
    assert.equal(stepForEvent("FailedCreate", "", "pull"), "schedule");
    assert.equal(stepForEvent("ErrImagePull", "", "start"), "pull");
    assert.equal(stepForEvent("Failed", "Failed to pull image", "start"), "pull");
    assert.equal(stepForEvent("Failed", "Error: container failed", "pull"), "start");
    assert.equal(stepForEvent("BackOff", "Back-off restarting failed container", "health"), "start");
    assert.equal(stepForEvent("Started", "", "pull"), "start");
    assert.equal(stepForEvent("Unhealthy", "", "start"), "health");
    assert.equal(stepForEvent("ScalingReplicaSet", "", "pull"), "apply");
    assert.equal(stepForEvent("Whatever", "", "health"), "health");
  });
});
