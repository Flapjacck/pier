import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendLog, finishDeployment, insertDeployment } from "../../src/db/deployments.js";
import { getDeployment } from "../../src/db/deployments-read.js";
import { openDatabase } from "../../src/db/open.js";
import { formatTimeout } from "../../src/deploys/reasons.js";
import { toDeployDetail } from "../../src/deploys/serialize.js";

describe("toDeployDetail", () => {
  it("uses ISO times, durations and step labels", () => {
    const db = openDatabase(":memory:");
    const id = insertDeployment(db, { app: "web", trigger: "create", spec: { image: "nginx" }, now: 0 });
    appendLog(db, { deploymentId: id, step: "validate", level: "info", text: "ok", ts: 500 });
    finishDeployment(db, id, { status: "failed", reason: "bad", step: "validate", now: 1500 });
    const row = getDeployment(db, id);
    assert.ok(row);
    const detail = toDeployDetail(row);
    assert.equal(detail.startedAt, "1970-01-01T00:00:00.000Z");
    assert.equal(detail.durationMs, 1500);
    assert.equal(detail.currentStep, "validate");
    assert.deepEqual(detail.steps[0], {
      name: "validate", label: "Validate", status: "failed", startedAt: "1970-01-01T00:00:00.000Z",
      finishedAt: "1970-01-01T00:00:01.500Z", durationMs: 1500, lines: [{ ts: "1970-01-01T00:00:00.500Z", level: "info", text: "ok" }],
    });
    assert.deepEqual(detail.steps[1]?.durationMs, null);
  });

  it("formats timeouts", () => {
    assert.deepEqual([formatTimeout(300_000), formatTimeout(90_000), formatTimeout(45_000)], ["5m", "1m 30s", "45s"]);
  });
});
