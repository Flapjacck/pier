import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finishDeployment, insertDeployment } from "../../src/db/deployments.js";
import { listDeployments } from "../../src/db/deployments-read.js";
import { pruneDeployments } from "../../src/db/deployments-prune.js";
import { openDatabase } from "../../src/db/open.js";

describe("pruneDeployments", () => {
  it("deletes finished deploys past the cutoff and never running ones", () => {
    const db = openDatabase(":memory:");
    const old = insertDeployment(db, { app: "web", trigger: "create", spec: {}, now: 1 });
    finishDeployment(db, old, { status: "succeeded", reason: null, now: 10 });
    const fresh = insertDeployment(db, { app: "web", trigger: "patch", spec: {}, now: 50 });
    finishDeployment(db, fresh, { status: "failed", reason: "x", now: 200 });
    const running = insertDeployment(db, { app: "web", trigger: "patch", spec: {}, now: 2 });
    assert.equal(pruneDeployments(db, { before: 100 }), 1);
    assert.deepEqual(listDeployments(db, { app: "web", limit: 10 }).items.map((d) => d.id), [running, fresh]);
  });

  it("keeps only the newest finished deploys per app", () => {
    const db = openDatabase(":memory:");
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const id = insertDeployment(db, { app: i % 2 ? "a" : "b", trigger: "patch", spec: {}, now: 1000 });
      finishDeployment(db, id, { status: "succeeded", reason: null, now: 1000 });
      ids.push(id);
    }
    const running = insertDeployment(db, { app: "a", trigger: "patch", spec: {}, now: 1000 });
    assert.equal(pruneDeployments(db, { before: 0, keepPerApp: 1 }), 3);
    assert.deepEqual(listDeployments(db, { app: "a", limit: 10 }).items.map((d) => d.id), [running, ids[3]]);
    assert.deepEqual(listDeployments(db, { app: "b", limit: 10 }).items.map((d) => d.id), [ids[4]]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM deployment_steps").get()?.n, 3 * 7);
  });
});
