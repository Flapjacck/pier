import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { appendLog, finishDeployment, insertDeployment } from "../../src/db/deployments.js";
import { openDatabase } from "../../src/db/open.js";
import { createFailedClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

// Recent times: buildApp prunes old finished deploys at startup.
const BASE = Date.now() - 60_000;

function seeded() {
  const db = openDatabase(":memory:");
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    const id = insertDeployment(db, { app: "web", trigger: i === 0 ? "create" : "patch", spec: { image: `nginx:1.${i}`, envKeys: ["A"] }, now: BASE + i * 1000 });
    ids.push(id);
  }
  finishDeployment(db, ids[0] ?? 0, { status: "succeeded", reason: null, now: BASE + 500 });
  finishDeployment(db, ids[1] ?? 0, { status: "failed", step: "validate", reason: "bad resources", now: BASE + 1500 });
  appendLog(db, { deploymentId: ids[2] ?? 0, step: "validate", level: "info", text: "checking", ts: BASE + 2100 });
  const other = insertDeployment(db, { app: "api", trigger: "create", spec: {}, now: BASE });
  return { db, ids, other };
}

async function appWith(db: ReturnType<typeof openDatabase>) {
  // Cluster unreachable: history comes from the database only (and nothing is resumed).
  return await buildApp(testConfig(), { logger: false, k8s: createFailedClientsResult(), db, deployPollMs: 60_000 });
}

const get = (url: string, headers: Record<string, string> = authHeader) => ({ method: "GET" as const, url, headers });

describe("GET /api/apps/:name/deployments", () => {
  it("lists newest first with summaries and pages with before", async () => {
    const { db, ids } = seeded();
    const app = await appWith(db);
    const first = await app.inject(get("/api/apps/web/deployments?limit=2"));
    assert.equal(first.statusCode, 200);
    const page = first.json();
    assert.deepEqual(page.deployments.map((d: { id: number }) => d.id), [ids[2], ids[1]]);
    assert.equal(page.nextBefore, ids[1]);
    const failed = page.deployments[1];
    assert.equal(failed.status, "failed");
    assert.equal(failed.reason, "bad resources");
    assert.equal(failed.trigger, "patch");
    assert.equal(failed.durationMs, 500);
    assert.equal(failed.startedAt, new Date(BASE + 1000).toISOString());
    assert.deepEqual(failed.spec, { image: "nginx:1.1", envKeys: ["A"] });
    assert.equal(page.deployments[0].currentStep, "validate");
    assert.equal(page.deployments[0].finishedAt, null);
    const rest = (await app.inject(get(`/api/apps/web/deployments?limit=2&before=${page.nextBefore}`))).json();
    assert.deepEqual(rest.deployments.map((d: { id: number }) => d.id), [ids[0]]);
    assert.equal(rest.nextBefore, null);
    await app.close();
  });

  it("returns an empty list for an unknown app and 400 for bad parameters", async () => {
    const { db } = seeded();
    const app = await appWith(db);
    const none = (await app.inject(get("/api/apps/nope/deployments"))).json();
    assert.deepEqual(none, { ok: true, deployments: [], nextBefore: null });
    for (const url of ["/api/apps/web/deployments?limit=0", "/api/apps/web/deployments?limit=51", "/api/apps/web/deployments?before=0", "/api/apps/web/deployments?x=1", "/api/apps/Bad_Name/deployments"]) {
      assert.equal((await app.inject(get(url))).statusCode, 400, url);
    }
    await app.close();
  });

  it("requires auth", async () => {
    const { db } = seeded();
    const app = await appWith(db);
    assert.equal((await app.inject(get("/api/apps/web/deployments", {}))).statusCode, 401);
    assert.equal((await app.inject(get("/api/apps/web/deployments/1", {}))).statusCode, 401);
    await app.close();
  });
});

describe("GET /api/apps/:name/deployments/:id", () => {
  it("returns the detail with labelled steps and lines", async () => {
    const { db, ids } = seeded();
    const app = await appWith(db);
    const res = await app.inject(get(`/api/apps/web/deployments/${ids[2]}`));
    assert.equal(res.statusCode, 200);
    const { deployment } = res.json();
    assert.equal(deployment.id, ids[2]);
    assert.deepEqual(deployment.steps.map((s: { name: string }) => s.name), ["validate", "apply", "schedule", "pull", "start", "health", "ready"]);
    assert.equal(deployment.steps[0].label, "Validate");
    assert.equal(deployment.steps[0].status, "running");
    assert.deepEqual(deployment.steps[0].lines, [{ ts: new Date(BASE + 2100).toISOString(), level: "info", text: "checking" }]);
    const failed = (await app.inject(get(`/api/apps/web/deployments/${ids[1]}`))).json().deployment;
    assert.equal(failed.steps[0].status, "failed");
    assert.equal(failed.steps[1].status, "skipped");
    await app.close();
  });

  it("returns 404 for a missing id or another app's deploy, 400 for a bad id", async () => {
    const { db, other } = seeded();
    const app = await appWith(db);
    for (const url of ["/api/apps/web/deployments/9999", `/api/apps/web/deployments/${other}`, `/api/apps/web/deployments/9999/stream`]) {
      const res = await app.inject(get(url));
      assert.equal(res.statusCode, 404, url);
      assert.deepEqual(res.json(), { ok: false, error: "deployment not found" });
    }
    assert.equal((await app.inject(get("/api/apps/web/deployments/abc"))).statusCode, 400);
    assert.equal((await app.inject(get("/api/apps/web/deployments/0"))).statusCode, 400);
    await app.close();
  });
});
