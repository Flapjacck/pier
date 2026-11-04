import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finishDeployment, insertDeployment } from "../../src/db/deployments.js";
import { getDeployment, listDeployments, listRunning, runningIdsForApp } from "../../src/db/deployments-read.js";
import { openDatabase } from "../../src/db/open.js";

function seed(count: number, app = "web") {
  const db = openDatabase(":memory:");
  const ids: number[] = [];
  for (let i = 0; i < count; i++) ids.push(insertDeployment(db, { app, trigger: "patch", spec: {}, now: i }));
  return { db, ids };
}

describe("listDeployments", () => {
  it("pages newest first with an id cursor", () => {
    const { db, ids } = seed(5);
    insertDeployment(db, { app: "other", trigger: "create", spec: {}, now: 9 });
    const first = listDeployments(db, { app: "web", limit: 2 });
    assert.deepEqual(first.items.map((d) => d.id), [ids[4], ids[3]]);
    assert.equal(first.nextBefore, ids[3]);
    const second = listDeployments(db, { app: "web", limit: 2, before: first.nextBefore ?? 0 });
    assert.deepEqual(second.items.map((d) => d.id), [ids[2], ids[1]]);
    const last = listDeployments(db, { app: "web", limit: 2, before: second.nextBefore ?? 0 });
    assert.deepEqual(last.items.map((d) => d.id), [ids[0]]);
    assert.equal(last.nextBefore, null);
  });

  it("returns an empty page for an unknown app", () => {
    const { db } = seed(1);
    assert.deepEqual(listDeployments(db, { app: "nope", limit: 10 }), { items: [], nextBefore: null });
  });
});

describe("running lookups", () => {
  it("lists running deploys and running ids per app", () => {
    const { db, ids } = seed(3);
    finishDeployment(db, ids[0] ?? 0, { status: "succeeded", reason: null, now: 10 });
    assert.deepEqual(listRunning(db).map((d) => d.id), [ids[1], ids[2]]);
    assert.deepEqual(runningIdsForApp(db, "web"), [ids[1], ids[2]]);
    assert.deepEqual(runningIdsForApp(db, "other"), []);
  });

  it("reads a bad spec as an empty object and a missing id as undefined", () => {
    const { db, ids } = seed(1);
    db.prepare("UPDATE deployments SET spec = 'nope' WHERE id = ?").run(ids[0] ?? 0);
    assert.deepEqual(getDeployment(db, ids[0] ?? 0)?.spec, {});
    assert.equal(getDeployment(db, 999), undefined);
  });
});
