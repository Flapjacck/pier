import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { buildApp } from "../../src/app.js";
import { insertAudit } from "../../src/db/audit.js";
import { openDatabase } from "../../src/db/open.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

// Times must be recent: buildApp prunes rows older than the retention window at startup.
const BASE = Date.now() - 60_000;
function seeded(): DatabaseSync {
  const db = openDatabase(":memory:");
  for (let i = 1; i <= 5; i++) {
    insertAudit(db, {
      ts: BASE + i * 1000,
      actor: "token",
      ip: "192.0.2.1",
      action: i === 5 ? "volume.delete" : "app.scale",
      app: i === 5 ? null : i % 2 ? "web" : "api",
      target: i === 5 ? "data" : null,
      status: 200,
      details: i === 5 ? {} : { replicas: i },
    });
  }
  return db;
}

async function appWith(db: DatabaseSync) {
  return await buildApp(testConfig(), { logger: false, k8s: createFakeClientsResult({}), db });
}

const get = (url: string, headers: Record<string, string> = authHeader) => ({ method: "GET" as const, url, headers });

describe("GET /api/audit", () => {
  it("returns entries newest first with ISO times and pages with before", async () => {
    const app = await appWith(seeded());
    const first = await app.inject(get("/api/audit?limit=2"));
    assert.equal(first.statusCode, 200);
    const body = first.json();
    assert.deepEqual(body.entries.map((e: { id: number }) => e.id), [5, 4]);
    assert.equal(body.nextBefore, 4);
    assert.deepEqual(body.entries[0], {
      id: 5, ts: new Date(BASE + 5000).toISOString(), actor: "token", ip: "192.0.2.1", action: "volume.delete",
      app: null, target: "data", status: 200, details: {},
    });
    assert.deepEqual(body.entries[1].details, { replicas: 4 });
    const second = (await app.inject(get("/api/audit?limit=2&before=4"))).json();
    assert.deepEqual(second.entries.map((e: { id: number }) => e.id), [3, 2]);
    const last = (await app.inject(get(`/api/audit?limit=2&before=${second.nextBefore}`))).json();
    assert.deepEqual(last.entries.map((e: { id: number }) => e.id), [1]);
    assert.equal(last.nextBefore, null);
    await app.close();
  });

  it("filters by app and defaults to 50 entries", async () => {
    const app = await appWith(seeded());
    const web = (await app.inject(get("/api/audit?app=web"))).json();
    assert.deepEqual(web.entries.map((e: { id: number }) => e.id), [3, 1]);
    assert.equal(web.nextBefore, null);
    await app.close();
    const many = openDatabase(":memory:");
    for (let i = 0; i < 55; i++) {
      insertAudit(many, { ts: Date.now() - i, actor: "session", ip: "192.0.2.1", action: "app.restart", app: "web", target: null, status: 202, details: {} });
    }
    const big = await appWith(many);
    const page = (await big.inject(get("/api/audit"))).json();
    assert.equal(page.entries.length, 50);
    assert.equal(page.nextBefore, 6);
    await big.close();
  });

  it("rejects a bad limit, cursor, app or unknown parameter with 400", async () => {
    const app = await appWith(seeded());
    for (const qs of ["limit=0", "limit=201", "limit=abc", "before=0", "app=Bad_Name", "foo=1"]) {
      const res = await app.inject(get(`/api/audit?${qs}`));
      assert.equal(res.statusCode, 400, qs);
      assert.equal(res.json().error, "invalid request");
    }
    await app.close();
  });

  it("requires auth", async () => {
    const app = await appWith(seeded());
    assert.equal((await app.inject(get("/api/audit", {}))).statusCode, 401);
    await app.close();
  });

  it("returns 500 when the database can't be read", async () => {
    const db = seeded();
    const app = await appWith(db);
    db.close();
    const res = await app.inject(get("/api/audit"));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.json(), { ok: false, error: "audit log unavailable" });
    await app.close();
  });
});
