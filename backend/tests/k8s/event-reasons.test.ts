import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeEvent } from "../../src/k8s/event-reasons.js";

describe("summarizeEvent", () => {
  it("maps common reasons and leaves unknown reasons undefined", () => {
    const cases: Array<[string, string]> = [
      ["FailedScheduling", "Insufficient cpu"],
      ["BackOff", "Back-off restarting failed container"],
      ["Unhealthy", "Readiness probe failed"],
      ["OOMKilling", "container killed"],
      ["OOMKilled", "container killed"],
      ["Evicted", "low on resource"],
      ["FailedMount", "volume failed"],
      ["Failed", "image failed"],
      ["ErrImagePull", "pull failed"],
      ["ImagePullBackOff", "pull failed"],
      ["Killing", ""],
      ["Pulled", ""],
      ["Created", ""],
      ["Started", ""],
      ["Scheduled", ""],
      ["ScalingReplicaSet", ""],
      ["SuccessfulCreate", ""],
      ["SuccessfulDelete", ""],
    ];
    for (const [reason, message] of cases) assert.equal(typeof summarizeEvent(reason, message), "string", reason);
    assert.equal(summarizeEvent("Other", "message"), undefined);
  });
});
