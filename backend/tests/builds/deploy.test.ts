import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSourceDeploy } from "../../src/builds/deploy.js";
import type { BuildSource } from "../../src/builds/types.js";
import { loadBuildConfig } from "../../src/config-builds.js";
import { getAppSource, upsertAppSource } from "../../src/db/app-sources.js";
import { getDeployment } from "../../src/db/deployments-read.js";
import { openDatabase } from "../../src/db/open.js";
import { createDeployTracker } from "../../src/deploys/tracker.js";
import type { BuildResult } from "../../src/builds/run.js";
import { sourceCluster, sourceK8s, type SourceCluster } from "../helpers/source-cluster.js";

/** runSourceDeploy outcomes (#83); the happy paths run through the routes in apps-source.test.ts. */

const quiet = { info: () => {}, warn: () => {}, error: () => {} };
const source: BuildSource = { method: "railpack", repo: "https://github.com/acme/web", branch: "main", folder: ".", dockerfile: "Dockerfile" };

async function run(opts: { cluster?: SourceCluster; source?: BuildSource; build?: BuildResult | "throw"; hintsThrow?: boolean } = {}) {
  const cluster = opts.cluster ?? sourceCluster();
  const k8s = sourceK8s(cluster);
  assert.ok(k8s.ok);
  const db = openDatabase(":memory:");
  const tracker = createDeployTracker({ db, k8s, namespace: "pier-apps", log: quiet, timeoutMs: 60_000, pollMs: 60_000 });
  const src = opts.source ?? source;
  upsertAppSource(db, { app: "web", ...src, updatedAt: 1, pendingCreate: { port: 3000, replicas: 1, env: { SECRET: "hunter2" } } });
  const deploy = tracker.begin("web", "create", {}, { build: true });
  assert.ok(deploy);
  await runSourceDeploy(
    {
      clients: k8s.clients,
      db,
      namespace: "pier-apps",
      config: loadBuildConfig({}),
      log: quiet,
      runBuild: async () => {
        if (opts.build === "throw") throw new Error("kaboom");
        return opts.build ?? { ok: true, image: "localhost:30500/web:d1", commit: "abc" };
      },
      volumeHints: async () => {
        if (opts.hintsThrow) throw new Error("registry down");
        return [{ path: "/data", reason: "The image declares VOLUME /data", source: "image" as const, confidence: "high" as const }];
      },
    },
    { app: "web", source: src, deploy, spec: {} },
  );
  const row = getDeployment(db, deploy.id);
  tracker.stop();
  const steps = Object.fromEntries((row?.steps ?? []).map((s) => [s.name, s.status]));
  return { row, steps, db, cluster };
}

describe("runSourceDeploy (#83)", () => {
  it("fails Validate when the git credential was deleted", async () => {
    const { row, steps } = await run({ source: { ...source, gitCredential: "gone" } });
    assert.equal(row?.status, "failed");
    assert.equal(steps.validate, "failed");
    assert.match(row?.reason ?? "", /no longer exists/);
  });

  it("a cancelled build ends quietly without creating the app", async () => {
    const { cluster, steps } = await run({ build: { ok: false, reason: "cancelled", cancelled: true } });
    assert.equal(cluster.creates.length, 0);
    assert.notEqual(steps.build, "failed");
  });

  it("an apply rejection fails Apply with the cluster's reason and keeps the pending settings for a retry", async () => {
    const quota = Object.assign(new Error("forbidden"), { statusCode: 403, body: JSON.stringify({ message: "exceeded quota: pier-apps-quota" }) });
    const { row, steps, db } = await run({ cluster: sourceCluster({ createError: quota }) });
    assert.equal(steps.build, "succeeded");
    assert.equal(steps.apply, "failed");
    assert.match(row?.reason ?? "", /quota/);
    assert.ok(getAppSource(db, "web")?.pendingCreate);
  });

  it("a hint failure doesn't block the deploy; an unexpected throw fails the right step", async () => {
    const ok = await run({ hintsThrow: true });
    assert.equal(ok.steps.apply, "succeeded");
    assert.deepEqual(getAppSource(ok.db, "web")?.volumeHints, []);

    const boom = await run({ build: "throw" });
    assert.equal(boom.steps.build, "failed");
    assert.equal(boom.cluster.creates.length, 0);
  });
});
