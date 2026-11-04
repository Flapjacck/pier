import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";
import { appendLog, deleteDeployment, finishDeployment, insertDeployment, setDeploySpec, setStepStatus } from "../db/deployments.js";
import { getDeployment, listRunning, runningIdsForApp } from "../db/deployments-read.js";
import type { K8sClientsResult } from "../k8s/clients.js";
import { reasons } from "./reasons.js";
import { failDeploy, tick, timeoutIfDue, type TickContext, type TrackerLog } from "./tracker-loop.js";
import type { DeploySpec, DeployTrigger, StepName } from "./types.js";

export type DeployHandle = {
  id: number;
  stepSucceeded: (step: StepName) => void;
  fail: (step: StepName, reason: string) => void;
  /** Delete the record (the request never touched this app, e.g. 409 exists or 404). */
  discard: () => void;
  /**
   * The change reached the cluster: cancel the app's older running deploys (superseded),
   * save the applied spec and start tracking the rollout. A rejected change never
   * supersedes anything, because the older rollout is still the one in the cluster.
   */
  applied: (spec: DeploySpec) => void;
};

export type DeployTracker = {
  /** Record a deploy (Validate running). Returns null when the database fails. */
  begin: (app: string, trigger: DeployTrigger, spec: DeploySpec) => DeployHandle | null;
  subscribe: (id: number, listener: () => void) => () => void;
  cancelApp: (app: string, reason: string) => void;
  resume: () => void;
  stop: () => void;
};

export type DeployTrackerOptions = {
  db: DatabaseSync;
  k8s: K8sClientsResult;
  namespace: string;
  log: TrackerLog;
  timeoutMs: number;
  pollMs?: number;
  now?: () => number;
};

type Loop = { timer?: NodeJS.Timeout; warned: boolean };

export function createDeployTracker(opts: DeployTrackerOptions): DeployTracker {
  const { db, log } = opts;
  const now = opts.now ?? Date.now;
  const pollMs = opts.pollMs ?? 2000;
  const ctx: TickContext = { db, k8s: opts.k8s, namespace: opts.namespace, timeoutMs: opts.timeoutMs, now };
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const loops = new Map<number, Loop>();
  let stopped = false;

  const emit = (id: number) => emitter.emit(String(id));

  /** Run a DB write; log and swallow errors so a deploy record never breaks a request. */
  function safe(what: string, id: number, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      log.error({ err, deploymentId: id }, `deploy ${what} failed`);
    }
    emit(id);
  }

  function stopLoop(id: number): void {
    const loop = loops.get(id);
    if (loop?.timer) clearTimeout(loop.timer);
    loops.delete(id);
  }

  function schedule(id: number, delay: number): void {
    const loop = loops.get(id);
    if (!loop || stopped) return;
    loop.timer = setTimeout(() => void run(id), delay);
    loop.timer.unref();
  }

  async function run(id: number): Promise<void> {
    const loop = loops.get(id);
    if (!loop || stopped) return;
    let finished = false;
    try {
      const result = await tick(ctx, id, () => loops.get(id) === loop && !stopped);
      finished = result.finished;
      if (result.changed) emit(id);
    } catch (err) {
      if (!loop.warned) {
        loop.warned = true;
        log.warn({ err, deploymentId: id }, "deploy tracking poll failed; retrying");
      }
      try {
        const row = getDeployment(db, id);
        finished = !row || row.status !== "running" || timeoutIfDue(ctx, row);
        if (finished) emit(id);
      } catch (dbErr) {
        log.error({ err: dbErr, deploymentId: id }, "deploy tracking failed");
        finished = true;
      }
    }
    if (loops.get(id) !== loop) return;
    if (finished) stopLoop(id);
    else schedule(id, pollMs);
  }

  function track(id: number, delay = 0): void {
    stopLoop(id);
    loops.set(id, { warned: false });
    schedule(id, delay);
  }

  function supersede(app: string, newId: number): void {
    for (const old of runningIdsForApp(db, app)) {
      if (old === newId) continue;
      stopLoop(old);
      if (finishDeployment(db, old, { status: "cancelled", reason: reasons.superseded(newId), now: now() })) emit(old);
    }
  }

  function begin(app: string, trigger: DeployTrigger, spec: DeploySpec): DeployHandle | null {
    let id: number;
    try {
      id = insertDeployment(db, { app, trigger, spec, now: now() });
    } catch (err) {
      log.error({ err, app }, "could not record the deploy");
      return null;
    }
    return {
      id,
      stepSucceeded: (step) => safe("step", id, () => void setStepStatus(db, id, step, "succeeded", now())),
      fail: (step, reason) => safe("fail", id, () => void failDeploy(db, id, step, reason, now())),
      discard: () => safe("discard", id, () => deleteDeployment(db, id)),
      applied: (applied) =>
        safe("apply", id, () => {
          const at = now();
          supersede(app, id);
          setDeploySpec(db, id, applied);
          setStepStatus(db, id, "validate", "succeeded", at);
          setStepStatus(db, id, "apply", "succeeded", at);
          setStepStatus(db, id, "schedule", "running", at);
          track(id);
        }),
    };
  }

  function subscribe(id: number, listener: () => void): () => void {
    const key = String(id);
    emitter.on(key, listener);
    return () => emitter.off(key, listener);
  }

  function cancelApp(app: string, reason: string): void {
    try {
      for (const id of runningIdsForApp(db, app)) {
        stopLoop(id);
        if (finishDeployment(db, id, { status: "cancelled", reason, now: now() })) emit(id);
      }
    } catch (err) {
      log.error({ err, app }, "could not cancel deploys");
    }
  }

  function resume(): void {
    try {
      for (const row of listRunning(db)) {
        const apply = getDeployment(db, row.id)?.steps.find((s) => s.name === "apply");
        if (apply?.status !== "succeeded") {
          failDeploy(db, row.id, "apply", reasons.restartedBeforeApply(), now());
        } else if (!timeoutIfDue(ctx, row)) {
          appendLog(db, { deploymentId: row.id, step: row.currentStep ?? "schedule", level: "info", text: "Pier restarted; resumed tracking.", ts: now() });
          track(row.id);
        }
      }
    } catch (err) {
      log.error({ err }, "could not resume deploy tracking");
    }
  }

  function stop(): void {
    stopped = true;
    for (const id of [...loops.keys()]) stopLoop(id);
    emitter.removeAllListeners();
  }

  return { begin, subscribe, cancelApp, resume, stop };
}
