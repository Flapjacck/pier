import type { BatchV1Api, CoreV1Api, V1Job, V1Pod } from "@kubernetes/client-node";
import type { BuildConfig } from "../config-builds.js";
import { BUILD_LOG_LINE_CAP } from "../db/deployments.js";
import type { DeployHandle } from "../deploys/tracker.js";
import { apiStatusCode } from "../k8s/api-errors.js";
import { BUILD_CONTAINERS, buildImageRefs, buildJob, buildJobName, type BuildContainer } from "./job.js";
import { COMMIT_MARKER } from "./job-scripts.js";
import { buildState, containerDone, readableContainers } from "./status.js";
import type { BuildSource } from "./types.js";

/**
 * Run one build Job and mirror it into the deploy's Build image step (#83): create the
 * Job, poll it, copy each container's new log lines, and end with the built image or a
 * plain-language reason. The Job is deleted when the deploy is cancelled or the build
 * fails; a successful Job is left for ttlSecondsAfterFinished so kubectl can still see it.
 */

export type BuildClients = {
  batch: Pick<BatchV1Api, "createNamespacedJob" | "readNamespacedJob" | "deleteNamespacedJob">;
  core: Pick<CoreV1Api, "listNamespacedPod" | "readNamespacedPodLog">;
};

export type RunBuildInput = {
  app: string;
  source: BuildSource;
  config: BuildConfig;
  handle: Pick<DeployHandle, "id" | "line" | "isRunning">;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type BuildResult =
  | { ok: true; image: string; commit: string | null }
  | { ok: false; reason: string; cancelled?: boolean };

/** Lines from the end of the failed container's log re-added when the cap dropped them. */
const FAILURE_TAIL = 30;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

/** emitted: lines already copied; tail: the latest lines, kept for the failure tail. */
type LogCursor = { emitted: number; tail: string[]; done: boolean };

async function readJob(clients: BuildClients, namespace: string, name: string): Promise<V1Job | undefined> {
  try {
    return await clients.batch.readNamespacedJob({ namespace, name });
  } catch (err) {
    if (apiStatusCode(err) === 404) return undefined;
    throw err;
  }
}

async function readPod(clients: BuildClients, namespace: string, job: string): Promise<V1Pod | undefined> {
  const pods = await clients.core.listNamespacedPod({ namespace, labelSelector: `job-name=${job}` });
  return pods.items.at(-1);
}

async function deleteJob(clients: BuildClients, namespace: string, name: string): Promise<void> {
  try {
    await clients.batch.deleteNamespacedJob({ namespace, name, propagationPolicy: "Background" });
  } catch {
    // Already gone, or TTL will clean it up; never mask the build result.
  }
}

export async function runBuild(clients: BuildClients, input: RunBuildInput): Promise<BuildResult> {
  const { app, source, config, handle } = input;
  const sleep = input.sleep ?? realSleep;
  const now = input.now ?? Date.now;
  const namespace = config.namespace;
  const name = buildJobName(app, handle.id);
  const order: readonly BuildContainer[] = source.method === "railpack" ? BUILD_CONTAINERS : ["clone", "build"];
  const cursors = new Map<BuildContainer, LogCursor>();
  let commit: string | null = null;
  let total = 0;

  const emit = (text: string) => {
    if (text.startsWith(COMMIT_MARKER)) {
      commit = text.slice(COMMIT_MARKER.length).trim() || null;
      handle.line("build", "info", `Commit ${commit?.slice(0, 12) ?? "unknown"}`);
      return;
    }
    handle.line("build", "info", text);
  };

  /** Copy new complete lines; a container's last partial line once it has exited. */
  const copyLogs = async (pod: V1Pod | undefined) => {
    const podName = pod?.metadata?.name;
    if (!podName) return;
    for (const container of readableContainers(pod, order)) {
      const cursor = cursors.get(container) ?? { emitted: 0, tail: [], done: false };
      cursors.set(container, cursor);
      if (cursor.done) continue;
      const done = containerDone(pod, container);
      let text: string;
      try {
        text = await clients.core.readNamespacedPodLog({ namespace, name: podName, container });
      } catch {
        continue; // Logs can lag a moment behind the status; the next poll catches up.
      }
      const lines = text.split("\n");
      // Without a trailing newline the last piece is still being written (or, once done, the real last line).
      if (!done || lines.at(-1) === "") lines.pop();
      for (const line of lines.slice(cursor.emitted)) {
        emit(line);
        total++;
      }
      cursor.emitted = lines.length;
      cursor.tail = lines.slice(-FAILURE_TAIL);
      cursor.done = done;
    }
  };

  const fail = async (reason: string, container?: BuildContainer): Promise<BuildResult> => {
    const tail = container ? cursors.get(container)?.tail : undefined;
    // Only when the cap dropped lines; otherwise the tail is already on the page.
    if (total > BUILD_LOG_LINE_CAP && tail?.length) {
      handle.line("build", "info", `Last ${tail.length} lines of ${container}:`, true);
      for (const line of tail) handle.line("build", "info", line, true);
    }
    await deleteJob(clients, namespace, name);
    return { ok: false, reason };
  };

  try {
    await clients.batch.createNamespacedJob({ namespace, body: buildJob({ app, deploymentId: handle.id, source, config }) });
  } catch (err) {
    const code = apiStatusCode(err);
    if (code === 403) return { ok: false, reason: "Pier is not allowed to create build Jobs; apply backend/k8s/rbac-builds.yaml." };
    if (code === 404) return { ok: false, reason: `The build namespace ${namespace} does not exist; apply backend/k8s/namespace-system.yaml.` };
    return { ok: false, reason: `Could not start the build: ${err instanceof Error ? err.message : String(err)}` };
  }
  handle.line("build", "info", `Build Job ${name} started (${source.method === "railpack" ? "Railpack" : `Dockerfile ${source.dockerfile}`}).`);

  // The Job's activeDeadlineSeconds is the real limit; this only stops a stuck poll loop.
  const giveUpAt = now() + (config.timeoutSeconds + 120) * 1000;
  let readErrors = 0;
  while (now() < giveUpAt) {
    if (!handle.isRunning()) {
      await deleteJob(clients, namespace, name);
      return { ok: false, reason: "cancelled", cancelled: true };
    }
    try {
      const job = await readJob(clients, namespace, name);
      const pod = job ? await readPod(clients, namespace, name) : undefined;
      await copyLogs(pod);
      readErrors = 0;
      const state = buildState({ job, pod, repo: source.repo, branch: source.branch, gitCredential: source.gitCredential, timeoutSeconds: config.timeoutSeconds });
      if (state.phase === "succeeded") return { ok: true, image: buildImageRefs({ app, deploymentId: handle.id, config }).pull, commit };
      if (state.phase === "failed") return await fail(state.reason, state.container);
    } catch (err) {
      // A brief API blip shouldn't fail a 10-minute build; a persistent one should.
      if (++readErrors >= 10) return await fail(`Lost contact with the build: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(input.pollMs ?? 2000);
  }
  return await fail(`The build took longer than ${Math.round(config.timeoutSeconds / 60)} minutes and was stopped.`);
}
