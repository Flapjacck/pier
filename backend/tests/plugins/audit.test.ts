import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { buildApp } from "../../src/app.js";
import { listAudit } from "../../src/db/audit.js";
import { openDatabase } from "../../src/db/open.js";
import { setupAudit } from "../../src/plugins/audit.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { fakeVolumeCluster } from "../helpers/fake-volume-cluster.js";
import { authHeader, TEST_TOKEN, testConfig } from "../helpers/test-config.js";

async function auditedApp(db: DatabaseSync) {
  const cluster = fakeVolumeCluster();
  const core = {
    ...cluster.core,
    listNamespacedPod: async () => ({ items: [{ metadata: { name: "web-pod" } }] }),
    deleteNamespacedPod: async () => ({}),
  };
  const k8s = createFakeClientsResult({
    apps: cluster.apps as never,
    core: core as never,
    networking: cluster.networking as never,
    storage: cluster.storage as never,
  });
  return await buildApp(testConfig(), { logger: false, k8s, db });
}

const actionsOf = (db: DatabaseSync) => listAudit(db, { limit: 200 }).entries.reverse();

describe("audit log hook", () => {
  it("writes one row per successful mutating route, without env values or tokens", async () => {
    const db = openDatabase(":memory:");
    const app = await auditedApp(db);
    const calls = [
      { method: "POST", url: "/api/login", payload: { token: TEST_TOKEN }, status: 204, auth: false },
      { method: "POST", url: "/api/apps", payload: { name: "web", image: "nginx:1.27", port: 80, env: { SECRET: "hunter2" }, volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] }, status: 201 },
      { method: "PATCH", url: "/api/apps/web", payload: { image: "nginx:1.28", env: { SECRET: "s3cr3t", OTHER: "x" } }, status: 200 },
      { method: "PATCH", url: "/api/apps/web/scale", payload: { replicas: 1 }, status: 200 },
      { method: "POST", url: "/api/apps/web/restart", status: 202 },
      { method: "DELETE", url: "/api/apps/web/pods/web-pod", status: 202 },
      { method: "POST", url: "/api/volumes", payload: { name: "spare", size: "2Gi" }, status: 201 },
      { method: "DELETE", url: "/api/volumes/spare", status: 200 },
      { method: "DELETE", url: "/api/apps/web?deleteVolumes=true", status: 200 },
    ] as const;
    for (const call of calls) {
      const res = await app.inject({
        method: call.method,
        url: call.url,
        headers: "auth" in call ? {} : authHeader,
        ...("payload" in call ? { payload: call.payload } : {}),
      });
      assert.equal(res.statusCode, call.status, `${call.method} ${call.url}: ${res.body}`);
    }
    const rows = actionsOf(db);
    assert.deepEqual(rows.map((r) => [r.action, r.app, r.target, r.actor]), [
      ["session.login", null, null, "session"],
      ["app.create", "web", null, "token"],
      ["app.update", "web", null, "token"],
      ["app.scale", "web", null, "token"],
      ["app.restart", "web", null, "token"],
      ["pod.delete", "web", "web-pod", "token"],
      ["volume.create", null, "spare", "token"],
      ["volume.delete", null, "spare", "token"],
      ["app.delete", "web", null, "token"],
    ]);
    assert.deepEqual(rows[1]?.details, { image: "nginx:1.27", port: 80, replicas: 1, envKeys: ["SECRET"], volumes: ["web-data"] });
    assert.deepEqual(rows[2]?.details, { fields: ["env", "image"], envKeys: ["OTHER", "SECRET"] });
    assert.deepEqual(rows[3]?.details, { replicas: 1 });
    assert.deepEqual(rows[6]?.details, { size: "2Gi" });
    assert.deepEqual(rows[8]?.details, { deleteVolumes: true });
    assert.ok(rows.every((r) => r.ip === "127.0.0.1" && r.ts > 0));
    const stored = JSON.stringify(db.prepare("SELECT * FROM audit_log").all());
    for (const secret of ["hunter2", "s3cr3t", TEST_TOKEN]) assert.ok(!stored.includes(secret), `stored ${secret}`);
    await app.close();
  });

  it("writes nothing for 4xx responses or reads", async () => {
    const db = openDatabase(":memory:");
    const app = await auditedApp(db);
    assert.equal((await app.inject({ method: "POST", url: "/api/login", payload: { token: "wrong" } })).statusCode, 401);
    assert.equal((await app.inject({ method: "PATCH", url: "/api/apps/web/scale", payload: { replicas: 1 } })).statusCode, 401);
    assert.equal((await app.inject({ method: "PATCH", url: "/api/apps/web/scale", headers: authHeader, payload: { replicas: 99 } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/apps/ghost/restart", headers: authHeader })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: "/api/apps", headers: authHeader })).statusCode, 200);
    assert.equal(actionsOf(db).length, 0);
    await app.close();
  });

  it("a failing database write does not break the request", async () => {
    const db = openDatabase(":memory:");
    const app = await auditedApp(db);
    db.close();
    const res = await app.inject({ method: "POST", url: "/api/volumes", headers: authHeader, payload: { name: "spare", size: "1Gi" } });
    assert.equal(res.statusCode, 201);
    await app.close();
  });

  it("refuses to start when a mutating route has no audit rule", async () => {
    const app = Fastify({ logger: false });
    setupAudit(app, { db: openDatabase(":memory:") });
    await assert.rejects(async () => {
      await app.register(async (api) => { api.post("/untracked", async () => ({})); }, { prefix: "/api" });
      await app.ready();
    }, /POST \/api\/untracked has no audit rule/);
  });
});
