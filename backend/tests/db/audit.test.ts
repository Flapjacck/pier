import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { insertAudit, listAudit, pruneAudit, type AuditInput } from "../../src/db/audit.js";
import { openDatabase } from "../../src/db/open.js";

function entry(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    ts: 1000,
    actor: "token",
    ip: "192.0.2.1",
    action: "app.scale",
    app: "web",
    target: null,
    status: 200,
    details: { replicas: 2 },
    ...overrides,
  };
}

describe("audit log", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("round-trips an entry with its details", () => {
    const id = insertAudit(db, entry({ actor: "session", target: "web-data", details: { fields: ["env"], envKeys: ["A"] } }));
    const page = listAudit(db, { limit: 10 });
    assert.deepEqual(page, {
      entries: [{ id, ...entry({ actor: "session", target: "web-data", details: { fields: ["env"], envKeys: ["A"] } }) }],
      nextBefore: null,
    });
  });

  it("pages newest first with a before cursor", () => {
    for (let i = 1; i <= 5; i++) insertAudit(db, entry({ ts: i }));
    const first = listAudit(db, { limit: 2 });
    assert.deepEqual(first.entries.map((e) => e.id), [5, 4]);
    assert.equal(first.nextBefore, 4);
    const second = listAudit(db, { limit: 2, before: 4 });
    assert.deepEqual(second.entries.map((e) => e.id), [3, 2]);
    const last = listAudit(db, { limit: 2, before: 2 });
    assert.deepEqual(last.entries.map((e) => e.id), [1]);
    assert.equal(last.nextBefore, null);
  });

  it("returns nextBefore null when the page is exactly full", () => {
    for (let i = 1; i <= 2; i++) insertAudit(db, entry());
    assert.equal(listAudit(db, { limit: 2 }).nextBefore, null);
  });

  it("filters by app", () => {
    insertAudit(db, entry({ app: "web" }));
    insertAudit(db, entry({ app: "api" }));
    insertAudit(db, entry({ app: null, action: "session.login" }));
    insertAudit(db, entry({ app: "web" }));
    const page = listAudit(db, { limit: 10, app: "web" });
    assert.deepEqual(page.entries.map((e) => e.id), [4, 1]);
    assert.deepEqual(listAudit(db, { limit: 1, app: "web", before: 4 }).entries.map((e) => e.id), [1]);
  });

  it("treats unreadable details as empty", () => {
    db.prepare("INSERT INTO audit_log (ts, actor, ip, action, status, details) VALUES (1, 'token', 'x', 'a', 200, 'not json')").run();
    db.prepare("INSERT INTO audit_log (ts, actor, ip, action, status, details) VALUES (1, 'token', 'x', 'a', 200, '[1]')").run();
    assert.deepEqual(listAudit(db, { limit: 5 }).entries.map((e) => e.details), [{}, {}]);
  });

  it("prunes rows older than the cutoff", () => {
    insertAudit(db, entry({ ts: 100 }));
    insertAudit(db, entry({ ts: 200 }));
    insertAudit(db, entry({ ts: 300 }));
    assert.equal(pruneAudit(db, 250), 2);
    assert.deepEqual(listAudit(db, { limit: 10 }).entries.map((e) => e.ts), [300]);
    assert.equal(pruneAudit(db, 250), 0);
  });
});
