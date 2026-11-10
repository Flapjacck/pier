import assert from "node:assert/strict";
import type { V1ContainerStatus, V1Job, V1Pod } from "@kubernetes/client-node";
import { describe, it } from "node:test";
import { runBuild, type BuildClients } from "../../src/builds/run.js";
import type { BuildSource } from "../../src/builds/types.js";
import { loadBuildConfig } from "../../src/config-builds.js";
import { BUILD_LOG_LINE_CAP } from "../../src/db/deployments.js";

const config = loadBuildConfig({});
const source: BuildSource = { method: "dockerfile", repo: "https://github.com/acme/web", branch: "main", folder: ".", dockerfile: "Dockerfile" };
const done = (name: string, exitCode: number): V1ContainerStatus => ({ name, image: "i", imageID: "", ready: false, restartCount: 0, state: { terminated: { exitCode } } });
const running = (name: string): V1ContainerStatus => ({ name, image: "i", imageID: "", ready: false, restartCount: 0, state: { running: {} } });

type Poll = { job: V1Job | undefined; init: V1ContainerStatus[]; main: V1ContainerStatus[]; logs: Record<string, string> };

/** Fake Batch/Core APIs that step through one Poll per readNamespacedJob. */
function fakeCluster(polls: Poll[], opts: { createError?: number } = {}) {
  const calls = { created: [] as V1Job[], deleted: [] as string[] };
  let i = -1;
  const current = () => polls[Math.min(i, polls.length - 1)] as Poll;
  const clients: BuildClients = {
    batch: {
      createNamespacedJob: async ({ body }) => {
        if (opts.createError) throw Object.assign(new Error("nope"), { code: opts.createError });
        calls.created.push(body);
        return body;
      },
      readNamespacedJob: async () => {
        i++;
        const job = current().job;
        if (!job) throw Object.assign(new Error("not found"), { code: 404 });
        return job;
      },
      deleteNamespacedJob: async ({ name }) => {
        calls.deleted.push(name);
        return {};
      },
    },
    core: {
      listNamespacedPod: async () => ({ items: [{ metadata: { name: "pod-1" }, status: { phase: "Running", initContainerStatuses: current().init, containerStatuses: current().main } } as V1Pod] }),
      readNamespacedPodLog: async ({ container }) => current().logs[container ?? ""] ?? "",
    },
  };
  return { clients, calls };
}

function fakeHandle(running = () => true) {
  const lines: { text: string; force: boolean }[] = [];
  return { lines, handle: { id: 9, isRunning: running, line: (_s: string, _l: string, text: string, force = false) => void lines.push({ text, force }) } };
}

const opts = { config, sleep: async () => {}, pollMs: 0 };
const complete: V1Job = { status: { conditions: [{ type: "Complete", status: "True" }] } };

describe("runBuild (#83)", () => {
  it("success: streams lines once, reports the commit and the pull ref", async () => {
    const { clients, calls } = fakeCluster([
      { job: {}, init: [running("clone")], main: [], logs: { clone: "Cloning\nhalf" } },
      { job: {}, init: [done("clone", 0)], main: [running("build")], logs: { clone: "Cloning\nhalf line\nPIER_COMMIT=0123456789abcdef\n", build: "#1 load\n" } },
      { job: complete, init: [done("clone", 0)], main: [done("build", 0)], logs: { clone: "ignored after done", build: "#1 load\n#2 push\n" } },
    ]);
    const { lines, handle } = fakeHandle();
    const result = await runBuild(clients, { app: "web", source, handle, ...opts });
    assert.deepEqual(result, { ok: true, image: "localhost:30500/web:d9", commit: "0123456789abcdef" });
    assert.equal(calls.created[0]?.metadata?.name, "pier-build-9-web");
    assert.deepEqual(calls.deleted, [], "a successful Job is left to its TTL");
    assert.deepEqual(lines.slice(1).map((l) => l.text), ["Cloning", "half line", "Commit 0123456789ab", "#1 load", "#2 push"]);
  });

  it("failure: plain reason, Job deleted, forced tail only when the cap dropped lines", async () => {
    const big = Array.from({ length: BUILD_LOG_LINE_CAP + 50 }, (_, n) => `line ${n}`).join("\n") + "\nERROR: boom\n";
    const { clients, calls } = fakeCluster([{ job: {}, init: [done("clone", 0)], main: [done("build", 1)], logs: { build: big } }]);
    const { lines, handle } = fakeHandle();
    const result = await runBuild(clients, { app: "web", source, handle, ...opts });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /image build failed/);
    assert.deepEqual(calls.deleted, ["pier-build-9-web"]);
    const forced = lines.filter((l) => l.force).map((l) => l.text);
    assert.equal(forced[0], "Last 30 lines of build:");
    assert.equal(forced.at(-1), "ERROR: boom");

    const small = fakeCluster([{ job: {}, init: [done("clone", 0)], main: [done("build", 1)], logs: { build: "ERROR: boom\n" } }]);
    const quiet = fakeHandle();
    await runBuild(small.clients, { app: "web", source, handle: quiet.handle, ...opts });
    assert.ok(!quiet.lines.some((l) => l.force));
  });

  it("cancelled deploy deletes the Job", async () => {
    const { clients, calls } = fakeCluster([{ job: {}, init: [running("clone")], main: [], logs: {} }]);
    let polls = 0;
    const { handle } = fakeHandle(() => polls++ < 2);
    const result = await runBuild(clients, { app: "web", source, handle, ...opts });
    assert.deepEqual(result, { ok: false, reason: "cancelled", cancelled: true });
    assert.deepEqual(calls.deleted, ["pier-build-9-web"]);
  });

  it("create refusals name the manifest to apply", async () => {
    for (const [code, re] of [[403, /rbac-builds\.yaml/], [404, /namespace-system\.yaml/]] as const) {
      const { clients } = fakeCluster([], { createError: code });
      const result = await runBuild(clients, { app: "web", source, handle: fakeHandle().handle, ...opts });
      assert.match(result.ok ? "" : result.reason, re);
    }
  });

  it("a deleted Job fails the build", async () => {
    const { clients } = fakeCluster([{ job: undefined, init: [], main: [], logs: {} }]);
    const result = await runBuild(clients, { app: "web", source, handle: fakeHandle().handle, ...opts });
    assert.match(result.ok ? "" : result.reason, /disappeared/);
  });
});
