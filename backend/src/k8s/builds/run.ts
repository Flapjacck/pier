import type { BatchV1Api, CoreV1Api, V1Job } from "@kubernetes/client-node";
import { buildJobName, buildJobSpec, type BuildJobInput } from "./job.js";

export type BuildStatus = "running" | "succeeded" | "failed";

export type BuildProgress = {
  status: BuildStatus;
  /** New log lines since the last poll (may be empty). */
  lines: string[];
  reason?: string;
};

function statusOf(job: V1Job): BuildStatus {
  const st = job.status;
  if (st?.succeeded && st.succeeded > 0) return "succeeded";
  if (st?.failed && st.failed > 0) return "failed";
  if (st?.conditions?.some((c) => c.type === "Failed" && c.status === "True")) return "failed";
  return "running";
}

export async function createBuildJob(batch: BatchV1Api, input: BuildJobInput): Promise<string> {
  const body = buildJobSpec(input);
  await batch.createNamespacedJob({ namespace: input.namespace, body });
  return body.metadata!.name!;
}

export async function deleteBuildJob(batch: BatchV1Api, namespace: string, app: string, deployId: number): Promise<void> {
  const name = buildJobName(app, deployId);
  try {
    await batch.deleteNamespacedJob({
      namespace,
      name,
      body: { propagationPolicy: "Background" },
    });
  } catch (err) {
    const code = (err as { response?: { statusCode?: number }; statusCode?: number }).response?.statusCode
      ?? (err as { statusCode?: number }).statusCode;
    if (code !== 404) throw err;
  }
}

async function findBuildPod(core: CoreV1Api, namespace: string, jobName: string): Promise<string | undefined> {
  const res = await core.listNamespacedPod({
    namespace,
    labelSelector: `job-name=${jobName}`,
  });
  const pod = res.items[0];
  return pod?.metadata?.name;
}

async function containerLog(
  core: CoreV1Api,
  namespace: string,
  pod: string,
  container: string,
): Promise<string> {
  try {
    const raw = await core.readNamespacedPodLog({ namespace, name: pod, container });
    return typeof raw === "string" ? raw : String(raw);
  } catch {
    return "";
  }
}

/**
 * Read new log bytes from the build pod (clone init + Kaniko). `sinceLogLen`
 * is characters already returned; only the suffix is yielded.
 */
export async function readBuildLogs(
  core: CoreV1Api,
  namespace: string,
  jobName: string,
  sinceLogLen: number,
): Promise<{ text: string; length: number }> {
  const pod = await findBuildPod(core, namespace, jobName);
  if (!pod) return { text: "", length: sinceLogLen };
  const clone = await containerLog(core, namespace, pod, "clone");
  const kaniko = await containerLog(core, namespace, pod, "kaniko");
  const parts: string[] = [];
  if (clone) parts.push(clone.endsWith("\n") ? clone : clone + "\n");
  if (kaniko) parts.push(kaniko);
  const text = parts.join("");
  if (text.length <= sinceLogLen) return { text: "", length: sinceLogLen };
  return { text: text.slice(sinceLogLen), length: text.length };
}

export async function getBuildJobStatus(batch: BatchV1Api, namespace: string, jobName: string): Promise<BuildStatus> {
  const job = await batch.readNamespacedJobStatus({ namespace, name: jobName });
  return statusOf(job);
}

export type RunBuildOptions = BuildJobInput & {
  batch: BatchV1Api;
  core: CoreV1Api;
  /** Called with new stdout chunks (already split into lines). */
  onLog?: (lines: string[]) => void;
  /** Poll interval ms (tests shorten). */
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Create a Kaniko Job, stream logs until it finishes or the deadline hits.
 * Throws on failure; returns when succeeded.
 */
export async function runBuildJob(opts: RunBuildOptions): Promise<void> {
  const pollMs = opts.pollMs ?? 2000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.timeoutSeconds * 1000;

  const jobName = await createBuildJob(opts.batch, opts);
  let logLen = 0;

  while (now() < deadline) {
    const logs = await readBuildLogs(opts.core, opts.namespace, jobName, logLen);
    logLen = logs.length;
    if (logs.text && opts.onLog) {
      const lines = logs.text.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length) opts.onLog(lines);
    }
    const status = await getBuildJobStatus(opts.batch, opts.namespace, jobName);
    if (status === "succeeded") return;
    if (status === "failed") {
      throw new BuildFailedError("The image build failed. Check the Build image step for Kaniko output.");
    }
    await sleep(pollMs);
  }
  throw new BuildFailedError("The image build timed out.");
}

export class BuildFailedError extends Error {
  readonly code = "build_failed" as const;
  constructor(message: string) {
    super(message);
    this.name = "BuildFailedError";
  }
}
