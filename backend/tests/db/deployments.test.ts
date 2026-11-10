import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILD_LOG_LINE_CAP,
  DEPLOY_LOG_LINE_CAP,
  DEPLOY_LOG_LINE_MAX,
  appendLog,
  deleteDeployment,
  finishDeployment,
  insertDeployment,
  setDeploySpec,
  setGeneration,
  setStepStatus,
} from "../../src/db/deployments.js";
import { getDeployment } from "../../src/db/deployments-read.js";
import { openDatabase } from "../../src/db/open.js";

function setup() {
  const db = openDatabase(":memory:");
  const id = insertDeployment(db, { app: "web", trigger: "create", spec: { image: "nginx", envKeys: ["A"] }, now: 1000 });
  return { db, id };
}

const statuses = (db: ReturnType<typeof setup>["db"], id: number) =>
  Object.fromEntries((getDeployment(db, id)?.steps ?? []).map((s) => [s.name, s.status]));

describe("insertDeployment", () => {
  it("creates a running deploy with all steps pending and Validate running", () => {
    const { db, id } = setup();
    const row = getDeployment(db, id);
    assert.equal(row?.status, "running");
    assert.equal(row?.app, "web");
    assert.equal(row?.trigger, "create");
    assert.equal(row?.startedAt, 1000);
    assert.equal(row?.currentStep, "validate");
    assert.deepEqual(row?.spec, { image: "nginx", envKeys: ["A"] });
    assert.deepEqual(row?.steps.map((s) => s.name), ["validate", "apply", "schedule", "pull", "start", "health", "ready"]);
    assert.equal(row?.steps[0]?.startedAt, 1000);
    assert.deepEqual(row?.steps.slice(1).map((s) => s.status), Array(6).fill("pending"));
  });
});

describe("setStepStatus", () => {
  it("sets times and never moves a step backwards", () => {
    const { db, id } = setup();
    assert.equal(setStepStatus(db, id, "validate", "succeeded", 1500), true);
    assert.equal(setStepStatus(db, id, "validate", "running", 1600), false);
    assert.equal(setStepStatus(db, id, "validate", "failed", 1600), false);
    const step = getDeployment(db, id)?.steps[0];
    assert.deepEqual({ status: step?.status, startedAt: step?.startedAt, finishedAt: step?.finishedAt }, { status: "succeeded", startedAt: 1000, finishedAt: 1500 });
  });

  it("ends a step that never ran with a zero duration, and a skipped one with no times", () => {
    const { db, id } = setup();
    setStepStatus(db, id, "apply", "succeeded", 2000);
    setStepStatus(db, id, "pull", "skipped", 2000);
    const steps = getDeployment(db, id)?.steps ?? [];
    assert.deepEqual([steps[1]?.startedAt, steps[1]?.finishedAt], [2000, 2000]);
    assert.deepEqual([steps[3]?.startedAt, steps[3]?.finishedAt], [null, null]);
  });
});

describe("appendLog", () => {
  it("keeps lines per step and ignores duplicate event keys", () => {
    const { db, id } = setup();
    assert.equal(appendLog(db, { deploymentId: id, step: "pull", level: "warning", text: "Back-off", ts: 5, eventKey: "e1:1" }), true);
    assert.equal(appendLog(db, { deploymentId: id, step: "pull", level: "warning", text: "Back-off", ts: 6, eventKey: "e1:1" }), false);
    assert.equal(appendLog(db, { deploymentId: id, step: "pull", level: "warning", text: "Back-off again", ts: 7, eventKey: "e1:2" }), true);
    const pull = getDeployment(db, id)?.steps.find((s) => s.name === "pull");
    assert.deepEqual(pull?.lines.map((l) => l.text), ["Back-off", "Back-off again"]);
  });

  it("caps lines per deploy with one dropped marker and trims long lines", () => {
    const { db, id } = setup();
    appendLog(db, { deploymentId: id, step: "start", level: "info", text: "x".repeat(DEPLOY_LOG_LINE_MAX + 50), ts: 1 });
    for (let i = 1; i < DEPLOY_LOG_LINE_CAP + 10; i++) appendLog(db, { deploymentId: id, step: "start", level: "info", text: `l${i}`, ts: i });
    const lines = getDeployment(db, id)?.steps.find((s) => s.name === "start")?.lines ?? [];
    assert.equal(lines.length, DEPLOY_LOG_LINE_CAP + 1);
    assert.equal(lines[0]?.text.length, DEPLOY_LOG_LINE_MAX);
    assert.ok(lines[0]?.text.endsWith("…"));
    assert.equal(lines.at(-1)?.text, "… more lines dropped");
  });
});

describe("appendLog build cap (#83)", () => {
  it("counts build lines separately from rollout lines and lets forced tail lines through", () => {
    const db = openDatabase(":memory:");
    const id = insertDeployment(db, { app: "web", trigger: "create", spec: { image: "", envKeys: [] }, now: 1000, build: true });
    for (let i = 0; i < BUILD_LOG_LINE_CAP + 5; i++) appendLog(db, { deploymentId: id, step: "build", level: "info", text: `b${i}`, ts: i });
    assert.equal(appendLog(db, { deploymentId: id, step: "build", level: "info", text: "ERROR tail", ts: 9999, force: true }), true);
    // A full build log must not swallow the rollout's own lines.
    assert.equal(appendLog(db, { deploymentId: id, step: "pull", level: "warning", text: "Back-off", ts: 10000 }), true);
    const steps = getDeployment(db, id)?.steps ?? [];
    const build = steps.find((s) => s.name === "build")?.lines ?? [];
    assert.equal(build.length, BUILD_LOG_LINE_CAP + 2);
    assert.equal(build.at(-2)?.text, "… more lines dropped");
    assert.equal(build.at(-1)?.text, "ERROR tail");
    assert.deepEqual(steps.find((s) => s.name === "pull")?.lines.map((l) => l.text), ["Back-off"]);
  });
});

describe("finishDeployment", () => {
  it("fails the named step and skips the rest", () => {
    const { db, id } = setup();
    setStepStatus(db, id, "validate", "succeeded", 1100);
    setStepStatus(db, id, "apply", "succeeded", 1200);
    setStepStatus(db, id, "schedule", "succeeded", 1300);
    setStepStatus(db, id, "pull", "running", 1300);
    assert.equal(finishDeployment(db, id, { status: "failed", reason: "bad image", step: "pull", now: 2000 }), true);
    const row = getDeployment(db, id);
    assert.equal(row?.status, "failed");
    assert.equal(row?.reason, "bad image");
    assert.equal(row?.finishedAt, 2000);
    assert.equal(row?.currentStep, "pull");
    assert.deepEqual(statuses(db, id), { validate: "succeeded", apply: "succeeded", schedule: "succeeded", pull: "failed", start: "skipped", health: "skipped", ready: "skipped" });
  });

  it("moves a failure on an ended step to the running one", () => {
    const { db, id } = setup();
    setStepStatus(db, id, "validate", "succeeded", 1100);
    setStepStatus(db, id, "apply", "running", 1100);
    finishDeployment(db, id, { status: "failed", reason: "x", step: "validate", now: 1200 });
    assert.equal(statuses(db, id).apply, "failed");
    assert.equal(statuses(db, id).validate, "succeeded");
  });

  it("is a no-op for a deploy that already finished", () => {
    const { db, id } = setup();
    assert.equal(finishDeployment(db, id, { status: "cancelled", reason: "Superseded", now: 1100 }), true);
    assert.equal(finishDeployment(db, id, { status: "failed", reason: "late", now: 1200 }), false);
    const row = getDeployment(db, id);
    assert.equal(row?.status, "cancelled");
    assert.equal(row?.reason, "Superseded");
    assert.equal(statuses(db, id).validate, "skipped");
  });
});

describe("spec, generation and delete", () => {
  it("updates the spec and generation and deletes with steps and lines", () => {
    const { db, id } = setup();
    setDeploySpec(db, id, { image: "nginx:2" });
    setGeneration(db, id, 4);
    appendLog(db, { deploymentId: id, step: "apply", level: "info", text: "hi", ts: 1 });
    assert.deepEqual(getDeployment(db, id)?.spec, { image: "nginx:2" });
    assert.equal(getDeployment(db, id)?.generation, 4);
    deleteDeployment(db, id);
    assert.equal(getDeployment(db, id), undefined);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM deployment_steps").get()?.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM deployment_logs").get()?.n, 0);
  });
});
