import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateDeploy, type EvaluateInput } from "../../src/deploys/evaluate.js";
import type { DeploySnapshot } from "../../src/deploys/observe.js";
import { dep, event, pod, readySnap, rs, snap } from "../helpers/deploy-cluster.js";

const START = 1_000_000;
const run = (snapshot: DeploySnapshot, extra: Partial<EvaluateInput> = {}) =>
  evaluateDeploy({ snapshot, generation: 2, startedAt: START, now: START + 5000, timeoutMs: 300_000, ...extra });

describe("evaluateDeploy: happy path", () => {
  it("waits for the controller before trusting the ReplicaSet", () => {
    const ev = run(snap({ deployment: dep({ observedGeneration: 1 }), pods: [pod({ scheduled: true })] }));
    assert.deepEqual(ev.steps, { schedule: "running" });
    assert.equal(ev.outcome, undefined);
  });

  it("walks schedule → pull → start → health → ready", () => {
    assert.equal(run(snap({ pods: [pod()] })).current, "schedule");
    const scheduled = run(snap({ pods: [pod({ scheduled: true })] }));
    assert.deepEqual(scheduled.steps, { schedule: "succeeded", pull: "running" });
    assert.ok(scheduled.lines.some((l) => l.text === "Scheduled on node node-a" && l.step === "schedule"));
    assert.equal(run(snap({ pods: [pod({ scheduled: true, container: { imageID: "sha", state: { waiting: { reason: "ContainerCreating" } } } })] })).current, "start");
    assert.equal(run(snap({ pods: [pod({ scheduled: true, container: { imageID: "sha", started: true, state: { running: {} } } })] })).current, "health");
    const healthy = run(snap({ deployment: dep({ updated: 1, available: 1, current: 2 }), pods: [pod({ scheduled: true, ready: true, container: { imageID: "sha", started: true } })] }));
    assert.equal(healthy.current, "ready", "old pod still terminating keeps Ready running");
    assert.equal(healthy.outcome, undefined);
    const done = run(readySnap());
    assert.deepEqual(done.outcome, { status: "succeeded", step: "ready", reason: null });
    assert.equal(done.steps.ready, "succeeded");
  });

  it("ignores old ReplicaSet pods and pods being deleted", () => {
    const ev = run(snap({ replicaSets: [rs("rs-1", "1"), rs()], pods: [pod({ uid: "old", owner: "rs-1", scheduled: true }), pod({ uid: "gone", scheduled: true, deleting: true })] }));
    assert.equal(ev.current, "schedule");
  });

  it("skips pod steps with zero replicas and succeeds once pods are gone", () => {
    const waiting = run(snap({ deployment: dep({ replicas: 0 }), pods: [pod({ uid: "old", owner: "rs-1" })] }));
    assert.deepEqual(waiting.steps, { schedule: "skipped", pull: "skipped", start: "skipped", health: "skipped", ready: "running" });
    assert.equal(run(snap({ deployment: dep({ replicas: 0 }) })).outcome?.status, "succeeded");
  });

  it("stores the generation from the Deployment when none was recorded", () => {
    assert.equal(run(snap(), { generation: null }).generation, 2);
  });
});

describe("evaluateDeploy: failures", () => {
  const fail = (snapshot: DeploySnapshot, now = START + 5000) => run(snapshot, { now }).outcome;

  it("ImagePullBackOff and InvalidImageName fail Pull image; ErrImagePull alone does not", () => {
    const backoff = fail(snap({ pods: [pod({ scheduled: true, container: { state: { waiting: { reason: "ImagePullBackOff", message: "Back-off pulling image" } } } })] }));
    assert.equal(backoff?.step, "pull");
    assert.match(backoff?.reason ?? "", /^The image nginx:bad could not be pulled: Back-off pulling image\. Check the name and tag/);
    assert.equal(fail(snap({ pods: [pod({ scheduled: true, container: { state: { waiting: { reason: "InvalidImageName", message: "bad" } } } })] }))?.step, "pull");
    assert.equal(fail(snap({ pods: [pod({ scheduled: true, container: { state: { waiting: { reason: "ErrImagePull", message: "x" } } } })] })), undefined);
  });

  it("CrashLoopBackOff fails Start container with the exit code, or Health check once started", () => {
    const crash = { state: { waiting: { reason: "CrashLoopBackOff" } }, lastState: { terminated: { exitCode: 3 } }, imageID: "sha" };
    const out = fail(snap({ pods: [pod({ scheduled: true, container: crash })] }));
    assert.deepEqual(out, { status: "failed", step: "start", reason: "The container keeps crashing (exit code 3). Check the Logs tab." });
    const started = fail(snap({ pods: [pod({ scheduled: true, container: { ...crash, started: true } })] }));
    assert.equal(started?.step, "health");
  });

  it("OOMKilled names the memory limit", () => {
    const out = fail(snap({ pods: [pod({ scheduled: true, memoryLimit: "128Mi", container: { imageID: "sha", state: { waiting: { reason: "CrashLoopBackOff" } }, lastState: { terminated: { exitCode: 137, reason: "OOMKilled" } } } })] }));
    assert.equal(out?.step, "start");
    assert.equal(out?.reason, "OOMKilled: the app ran out of memory (limit 128Mi). Raise the RAM limit in Settings.");
  });

  it("CreateContainerConfigError fails Start container", () => {
    const out = fail(snap({ pods: [pod({ scheduled: true, container: { imageID: "sha", state: { waiting: { reason: "CreateContainerConfigError", message: "secret missing" } } } })] }));
    assert.deepEqual(out, { status: "failed", step: "start", reason: "The container could not be created: secret missing" });
  });

  it("unschedulable fails Schedule pod only after the 60 s grace", () => {
    const unsched = snap({ pods: [pod({ unschedulableSince: START })] });
    assert.equal(fail(unsched, START + 30_000), undefined);
    const out = fail(unsched, START + 61_000);
    assert.equal(out?.step, "schedule");
    assert.equal(out?.reason, "No node can run the pod: Not enough memory on the node.");
  });

  it("a quota FailedCreate fails Schedule pod with a quota reason", () => {
    const out = fail(snap({ replicaSets: [rs("rs-2", "2", 'pods "web-x" is forbidden: exceeded quota: pier-apps, requested: memory=1Gi')] }));
    assert.equal(out?.step, "schedule");
    assert.match(out?.reason ?? "", /^The namespace quota is full: .*exceeded quota.*Lower CPU\/RAM in Settings/);
    assert.match(fail(snap({ replicaSets: [rs("rs-2", "2", "admission webhook denied")] }))?.reason ?? "", /^Kubernetes could not create the pod: admission/);
  });

  it("ProgressDeadlineExceeded fails the current step", () => {
    const out = fail(snap({ deployment: dep({ progressDeadline: true }), pods: [pod({ scheduled: true })] }));
    assert.deepEqual(out, { status: "failed", step: "pull", reason: "Kubernetes gave up waiting for the rollout (progress deadline exceeded)." });
  });

  it("times out on the current step with the last warning", () => {
    const snapshot = snap({
      pods: [pod({ scheduled: true, container: { imageID: "sha", started: true, state: { running: {} } } })],
      events: [event({ uid: "e1", involved: "p1", reason: "Unhealthy", message: "Readiness probe failed: dial tcp", type: "Warning", at: START + 10 })],
    });
    const out = fail(snapshot, START + 300_000);
    assert.equal(out?.step, "health");
    assert.equal(out?.reason, "Timed out after 5m waiting for Health check: the readiness check never passed. Last warning: The readiness health check is failing. (Unhealthy)");
    assert.equal(fail(snap({ pods: [pod()] }), START + 300_000)?.reason, "Timed out after 5m waiting for Schedule pod.");
  });

  it("cancels when the Deployment is gone", () => {
    assert.deepEqual(fail(snap({ deployment: null })), { status: "cancelled", step: "schedule", reason: "The app was deleted." });
  });
});
