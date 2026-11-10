import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { listAudit } from "../../src/db/audit.js";
import { getDeployment } from "../../src/db/deployments-read.js";
import { insertDeployment, rolloutStartedAt, setStepStatus } from "../../src/db/deployments.js";
import { openDatabase } from "../../src/db/open.js";
import type { DeploySnapshot } from "../../src/deploys/observe.js";
import { createDeployTracker } from "../../src/deploys/tracker.js";
import { timeoutIfDue } from "../../src/deploys/tracker-loop.js";
import { stepsForDeploy } from "../../src/deploys/types.js";
import { readySnap, snap, snapshotClients } from "../helpers/deploy-cluster.js";
import { waitFor } from "../helpers/wait-for.js";

const START = 1_000_000;
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

function setup(state: { snapshot: DeploySnapshot }, db: DatabaseSync = openDatabase(":memory:")) {
  const clock = { t: START };
  const tracker = createDeployTracker({ db, k8s: snapshotClients(state), namespace: "pier-apps", log: quiet, timeoutMs: 60_000, pollMs: 5, now: () => clock.t });
  return { db, clock, tracker };
}

const stepNames = (db: DatabaseSync, id: number) => (getDeployment(db, id)?.steps ?? []).map((s) => s.name);
const source = { method: "railpack" as const, repo: "https://github.com/acme/web", branch: "main", folder: "" };

describe("deploy tracker build step (#83)", () => {
  it("only build deploys get a Build image step, between validate and apply", () => {
    assert.deepEqual(stepsForDeploy(false), ["validate", "apply", "schedule", "pull", "start", "health", "ready"]);
    assert.deepEqual(stepsForDeploy(true), ["validate", "build", "apply", "schedule", "pull", "start", "health", "ready"]);
    const { db, tracker } = setup({ snapshot: snap() });
    const image = tracker.begin("web", "create", { image: "nginx" });
    const build = tracker.begin("api", "create", { source }, { build: true });
    assert.ok(image && build);
    assert.ok(!stepNames(db, image.id).includes("build"));
    assert.equal(stepNames(db, build.id)[1], "build");
    tracker.stop();
  });

  it("streams build lines, saves the commit and rolls out after the build", async () => {
    const state = { snapshot: snap() };
    const { db, clock, tracker } = setup(state);
    const handle = tracker.begin("api", "create", { source }, { build: true });
    assert.ok(handle);
    handle.stepSucceeded("validate");
    handle.stepStarted("build");
    handle.line("build", "info", "#5 [build 2/4] RUN npm ci");
    handle.updateSpec({ source: { ...source, commit: "abc123" } });
    // A long build must not count against the rollout timeout.
    clock.t = START + 10 * 60_000;
    handle.stepSucceeded("build");
    handle.applied({ image: "localhost:30500/api:abc123", source: { ...source, commit: "abc123" } });
    state.snapshot = readySnap();
    await waitFor(() => getDeployment(db, handle.id)?.status === "succeeded", 2000, "success");
    const detail = getDeployment(db, handle.id);
    assert.equal(detail?.spec.source?.commit, "abc123");
    const buildStep = detail?.steps.find((s) => s.name === "build");
    assert.equal(buildStep?.status, "succeeded");
    assert.deepEqual(buildStep?.lines.map((l) => l.text), ["#5 [build 2/4] RUN npm ci"]);
    tracker.stop();
  });

  it("a failed build fails the Build step, skips the rest and records Activity", () => {
    const { db, tracker } = setup({ snapshot: snap() });
    const handle = tracker.begin("api", "create", { source }, { build: true });
    assert.ok(handle);
    handle.stepSucceeded("validate");
    handle.stepStarted("build");
    handle.fail("build", "The build failed: exit code 1.");
    assert.equal(handle.isRunning(), false);
    const detail = getDeployment(db, handle.id);
    assert.equal(detail?.status, "failed");
    assert.equal(detail?.steps.find((s) => s.name === "build")?.status, "failed");
    assert.equal(detail?.steps.find((s) => s.name === "apply")?.status, "skipped");
    const [row] = listAudit(db, { limit: 10 }).entries;
    assert.equal(row?.action, "deploy.failed");
    assert.equal(row?.actor, "pier");
    assert.equal(row?.app, "api");
    assert.equal(row?.target, String(handle.id));
    assert.equal(row?.details.repo, source.repo);
    tracker.stop();
  });

  it("records cancelled deploys in Activity when the app is deleted", () => {
    const { db, tracker } = setup({ snapshot: snap() });
    const handle = tracker.begin("api", "create", { source }, { build: true });
    tracker.cancelApp("api", "The app was deleted.");
    assert.equal(handle?.isRunning(), false);
    assert.equal(listAudit(db, { limit: 10 }).entries[0]?.action, "deploy.cancelled");
    tracker.stop();
  });

  it("rollout timeout starts when the build ends and never fires mid-build", () => {
    const db = openDatabase(":memory:");
    const id = insertDeployment(db, { app: "api", trigger: "create", spec: {}, now: START, build: true });
    assert.equal(rolloutStartedAt(db, id, START), null);
    const ctx = { db, k8s: snapshotClients({ snapshot: snap() }), namespace: "pier-apps", timeoutMs: 60_000, now: () => START + 3_600_000 };
    const row = () => getDeployment(db, id) ?? assert.fail("row");
    assert.equal(timeoutIfDue(ctx, row()), false);
    setStepStatus(db, id, "build", "running", START);
    setStepStatus(db, id, "build", "succeeded", START + 3_590_000);
    assert.equal(rolloutStartedAt(db, id, START), START + 3_590_000);
    assert.equal(timeoutIfDue(ctx, row()), false);
    assert.equal(timeoutIfDue({ ...ctx, now: () => START + 3_650_000 }, row()), true);
    const plain = insertDeployment(db, { app: "web", trigger: "create", spec: {}, now: START });
    assert.equal(rolloutStartedAt(db, plain, START), START);
  });

  it("fails a build that was running when Pier restarted", () => {
    const db = openDatabase(":memory:");
    const id = insertDeployment(db, { app: "api", trigger: "build", spec: { source }, now: START, build: true });
    setStepStatus(db, id, "validate", "succeeded", START);
    setStepStatus(db, id, "build", "running", START);
    const { tracker } = setup({ snapshot: snap() }, db);
    tracker.resume();
    const detail = getDeployment(db, id);
    assert.equal(detail?.status, "failed");
    assert.equal(detail?.steps.find((s) => s.name === "build")?.status, "failed");
    assert.match(detail?.reason ?? "", /restarted while the image was building/);
    tracker.stop();
  });
});
