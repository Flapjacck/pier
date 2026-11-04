import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { insertAudit, listAudit } from "../../src/db/audit.js";
import { finishDeployment, insertDeployment } from "../../src/db/deployments.js";
import { SqliteLoginLimiter } from "../../src/db/login-limiter.js";
import { pruneOnce, startPruning } from "../../src/db/maintenance.js";
import { openDatabase } from "../../src/db/open.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

function logger() {
  const errors: string[] = [];
  return { errors, log: { info: () => {}, error: (_obj: object, msg: string) => void errors.push(msg) } };
}

function seed(db: DatabaseSync, ts: number) {
  insertAudit(db, { ts, actor: "token", ip: "x", action: "app.restart", app: "web", target: null, status: 200, details: {} });
}

describe("database pruning", () => {
  it("removes audit rows past retention and expired login windows", () => {
    const db = openDatabase(":memory:");
    const limiter = new SqliteLoginLimiter(db);
    seed(db, NOW - 91 * DAY);
    seed(db, NOW - 89 * DAY);
    limiter.recordFailure("old", 0);
    limiter.recordFailure("live", NOW);
    const { log } = logger();
    assert.deepEqual(pruneOnce({ db, limiter, retentionDays: 90, log, now: () => NOW }), { audit: 1, logins: 1, deployments: 0 });
    assert.equal(listAudit(db, { limit: 10 }).entries.length, 1);
    assert.equal(limiter.isLimited("live", NOW), false);
  });

  it("logs and swallows errors (closed database)", () => {
    const db = openDatabase(":memory:");
    const limiter = new SqliteLoginLimiter(db);
    db.close();
    const { log, errors } = logger();
    assert.deepEqual(pruneOnce({ db, limiter, retentionDays: 90, log }), { audit: 0, logins: 0, deployments: 0 });
    assert.deepEqual(errors, ["database prune failed"]);
  });

  it("prunes once at start and stops cleanly", () => {
    const db = openDatabase(":memory:");
    const limiter = new SqliteLoginLimiter(db);
    seed(db, 0);
    const { log } = logger();
    const stop = startPruning({ db, limiter, retentionDays: 1, log, now: () => NOW }, 10);
    assert.equal(listAudit(db, { limit: 10 }).entries.length, 0);
    stop();
  });
});

describe("deploy pruning", () => {
  it("prunes finished deploys with the audit retention", () => {
    const db = openDatabase(":memory:");
    const limiter = new SqliteLoginLimiter(db);
    const id = insertDeployment(db, { app: "web", trigger: "create", spec: {}, now: 0 });
    finishDeployment(db, id, { status: "succeeded", reason: null, now: NOW - 91 * DAY });
    const { log } = logger();
    assert.deepEqual(pruneOnce({ db, limiter, retentionDays: 90, log, now: () => NOW }), { audit: 0, logins: 0, deployments: 1 });
  });
});
