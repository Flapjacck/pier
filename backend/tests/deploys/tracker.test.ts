import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { getDeployment } from "../../src/db/deployments-read.js";
import { insertDeployment, setStepStatus } from "../../src/db/deployments.js";
import { openDatabase } from "../../src/db/open.js";
import type { DeploySnapshot } from "../../src/deploys/observe.js";
import { createDeployTracker } from "../../src/deploys/tracker.js";
import { createFailedClientsResult } from "../helpers/fake-clients.js";
import { event, pod, readySnap, snap, snapshotClients } from "../helpers/deploy-cluster.js";
import { waitFor } from "../helpers/wait-for.js";

const START = 1_000_000;
const dirs: string[] = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function logger() {
  const warns: string[] = [];
  const errors: string[] = [];
  return { warns, errors, log: { info: () => {}, warn: (_o: object, m: string) => void warns.push(m), error: (_o: object, m: string) => void errors.push(m) } };
}

function setup(state: { snapshot: DeploySnapshot; fail?: boolean; reads?: number }, db: DatabaseSync = openDatabase(":memory:")) {
  const clock = { t: START };
  const logs = logger();
  const tracker = createDeployTracker({ db, k8s: snapshotClients(state), namespace: "pier-apps", log: logs.log, timeoutMs: 60_000, pollMs: 5, now: () => clock.t });
  return { db, clock, tracker, ...logs };
}

const status = (db: DatabaseSync, id: number) => getDeployment(db, id)?.status;
const steps = (db: DatabaseSync, id: number) => Object.fromEntries((getDeployment(db, id)?.steps ?? []).map((s) => [s.name, s.status]));

describe("deploy tracker", () => {
  it("tracks a rollout to success and emits on changes", async () => {
    const state = { snapshot: snap({ pods: [pod()] }) };
    const { db, tracker } = setup(state);
    const handle = tracker.begin("web", "create", { image: "nginx", envKeys: ["A"] });
    assert.ok(handle);
    let emits = 0;
    tracker.subscribe(handle.id, () => void emits++);
    handle.applied({ image: "nginx", envKeys: ["A"] });
    assert.deepEqual(steps(db, handle.id), { validate: "succeeded", apply: "succeeded", schedule: "running", pull: "pending", start: "pending", health: "pending", ready: "pending" });
    await waitFor(() => (getDeployment(db, handle.id)?.generation ?? null) === 2, 2000, "generation");
    state.snapshot = readySnap();
    await waitFor(() => status(db, handle.id) === "succeeded", 2000, "success");
    assert.deepEqual(Object.values(steps(db, handle.id)), Array(7).fill("succeeded"));
    const lines = getDeployment(db, handle.id)?.steps.flatMap((s) => s.lines.map((l) => l.text)) ?? [];
    assert.ok(lines.includes("Scheduled on node node-a"));
    assert.ok(lines.includes("1 of 1 replicas available."));
    assert.ok(emits > 0);
    tracker.stop();
  });

  it("fails with the reason as an error line and never duplicates event lines", async () => {
    const warning = event({ uid: "e1", involved: "p1", reason: "Failed", message: "Failed to pull image", type: "Warning", at: START });
    const state = { snapshot: snap({ pods: [pod({ scheduled: true, container: { state: { waiting: { reason: "ErrImagePull", message: "not found" } } } })], events: [warning] }), reads: 0 };
    const { db, tracker } = setup(state);
    const handle = tracker.begin("web", "patch", {});
    handle?.applied({});
    const id = handle?.id ?? 0;
    await waitFor(() => (state.reads ?? 0) > 12, 2000, "several polls");
    state.snapshot = snap({ pods: [pod({ scheduled: true, container: { state: { waiting: { reason: "ImagePullBackOff", message: "Back-off" } } } })], events: [warning] });
    await waitFor(() => status(db, id) === "failed", 2000, "failure");
    const detail = getDeployment(db, id);
    assert.equal(steps(db, id).pull, "failed");
    assert.equal(steps(db, id).start, "skipped");
    const pull = detail?.steps.find((s) => s.name === "pull")?.lines ?? [];
    assert.equal(pull.filter((l) => l.text.includes("(Failed)")).length, 1);
    assert.equal(pull.at(-1)?.level, "error");
    assert.match(pull.at(-1)?.text ?? "", /could not be pulled/);
    tracker.stop();
  });

  it("supersedes a running deploy and cancels on delete", () => {
    const { db, tracker } = setup({ snapshot: snap() });
    const first = tracker.begin("web", "patch", {});
    first?.applied({});
    const second = tracker.begin("web", "restart", {});
    assert.equal(status(db, first?.id ?? 0), "cancelled");
    assert.equal(getDeployment(db, first?.id ?? 0)?.reason, `Superseded by deploy #${second?.id}.`);
    tracker.cancelApp("web", "The app was deleted.");
    assert.equal(status(db, second?.id ?? 0), "cancelled");
    assert.equal(getDeployment(db, second?.id ?? 0)?.reason, "The app was deleted.");
    tracker.stop();
  });

  it("fail and discard record validation errors or drop the row", () => {
    const { db, tracker } = setup({ snapshot: snap() });
    const bad = tracker.begin("web", "create", {});
    bad?.fail("validate", "quota full");
    assert.equal(steps(db, bad?.id ?? 0).validate, "failed");
    assert.equal(getDeployment(db, bad?.id ?? 0)?.reason, "quota full");
    const exists = tracker.begin("web", "create", {});
    exists?.discard();
    assert.equal(getDeployment(db, exists?.id ?? 0), undefined);
    tracker.stop();
  });

  it("begin returns null when the database fails", () => {
    const db = openDatabase(":memory:");
    const { tracker, errors } = setup({ snapshot: snap() }, db);
    db.close();
    assert.equal(tracker.begin("web", "create", {}), null);
    assert.deepEqual(errors, ["could not record the deploy"]);
  });

  it("retries failing polls (warning once) and times out", async () => {
    const state = { snapshot: snap(), fail: true, reads: 0 };
    const { db, tracker, clock, warns } = setup(state);
    const handle = tracker.begin("web", "patch", {});
    handle?.applied({});
    await waitFor(() => (state.reads ?? 0) > 8, 2000, "retries");
    assert.deepEqual(warns, ["deploy tracking poll failed; retrying"]);
    clock.t = START + 61_000;
    await waitFor(() => status(db, handle?.id ?? 0) === "failed", 2000, "timeout");
    assert.equal(getDeployment(db, handle?.id ?? 0)?.reason, "Timed out after 1m waiting for Schedule pod.");
    tracker.stop();
  });

  it("survives an unreachable cluster result", async () => {
    const db = openDatabase(":memory:");
    const logs = logger();
    const tracker = createDeployTracker({ db, k8s: createFailedClientsResult(), namespace: "pier-apps", log: logs.log, timeoutMs: 60_000, pollMs: 5 });
    tracker.begin("web", "patch", {})?.applied({});
    await waitFor(() => logs.warns.length === 1, 2000, "warning");
    tracker.stop();
  });

  it("resumes after a restart with a file database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pier-deploys-"));
    dirs.push(dir);
    const path = join(dir, "pier.db");
    const before = openDatabase(path);
    const tracked = insertDeployment(before, { app: "web", trigger: "patch", spec: {}, now: START });
    for (const step of ["validate", "apply"] as const) setStepStatus(before, tracked, step, "succeeded", START);
    setStepStatus(before, tracked, "schedule", "running", START);
    const interrupted = insertDeployment(before, { app: "api", trigger: "create", spec: {}, now: START });
    const stale = insertDeployment(before, { app: "old", trigger: "patch", spec: {}, now: START - 120_000 });
    for (const step of ["validate", "apply"] as const) setStepStatus(before, stale, step, "succeeded", START - 120_000);
    before.close();

    const db = openDatabase(path);
    const state = { snapshot: readySnap() };
    const { tracker } = setup(state, db);
    tracker.resume();
    assert.equal(status(db, interrupted), "failed");
    assert.equal(getDeployment(db, interrupted)?.reason, "Pier restarted before the change was applied. Check Settings and deploy again.");
    assert.equal(steps(db, interrupted).apply, "failed");
    assert.equal(status(db, stale), "failed");
    assert.match(getDeployment(db, stale)?.reason ?? "", /^Timed out after 1m/);
    await waitFor(() => status(db, tracked) === "succeeded", 2000, "resumed success");
    const lines = getDeployment(db, tracked)?.steps.flatMap((s) => s.lines.map((l) => l.text)) ?? [];
    assert.equal(lines.filter((l) => l === "Pier restarted; resumed tracking.").length, 1);
    tracker.stop();
    db.close();
  });
});
