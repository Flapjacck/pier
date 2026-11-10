import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, runMigrations, type Migration } from "../../../src/db/migrations/index.js";

function tables(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));
}

describe("runMigrations", () => {
  it("creates every table on a fresh database and records each version", () => {
    const db = new DatabaseSync(":memory:");
    assert.deepEqual(runMigrations(db, MIGRATIONS, () => 1234), [1, 2, 3, 4]);
    assert.deepEqual(tables(db), [
      "app_sources",
      "audit_log",
      "deployment_logs",
      "deployment_steps",
      "deployments",
      "login_attempts",
      "schema_migrations",
    ]);
    const rows = db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { version: 1, name: "init", applied_at: 1234 },
      { version: 2, name: "deployments", applied_at: 1234 },
      { version: 3, name: "app_sources", applied_at: 1234 },
      { version: 4, name: "app_sources_build", applied_at: 1234 },
    ]);
    db.close();
  });

  it("is a no-op when run again", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);
    db.prepare("INSERT INTO login_attempts (ip, count, reset_at) VALUES ('ip', 1, 1)").run();
    assert.deepEqual(runMigrations(db), []);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n, MIGRATIONS.length);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM login_attempts").get()?.n, 1, "data kept");
    db.close();
  });

  it("applies only migrations newer than the recorded version", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);
    const next: Migration = { version: 99, name: "extra", sql: "CREATE TABLE extra (id INTEGER)" };
    assert.deepEqual(runMigrations(db, [...MIGRATIONS, next]), [99]);
    assert.ok(tables(db).includes("extra"));
    db.close();
  });

  it("rolls back a failing migration and leaves no version row", () => {
    const db = new DatabaseSync(":memory:");
    const bad: Migration = { version: 1, name: "bad", sql: "CREATE TABLE ok_table (id INTEGER); NOT SQL" };
    assert.throws(() => runMigrations(db, [bad]), /migration 1 \(bad\) failed/);
    assert.ok(!tables(db).includes("ok_table"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n, 0);
    db.close();
  });

  it("rejects migrations listed out of order", () => {
    const db = new DatabaseSync(":memory:");
    const a: Migration = { version: 2, name: "a", sql: "SELECT 1" };
    const b: Migration = { version: 1, name: "b", sql: "SELECT 1" };
    assert.throws(() => runMigrations(db, [a, b]), /out of order/);
    db.close();
  });

  it("upgrades a database that only has migration 001, keeping its rows", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, MIGRATIONS.slice(0, 1));
    db.prepare("INSERT INTO login_attempts (ip, count, reset_at) VALUES ('ip', 1, 1)").run();
    assert.deepEqual(runMigrations(db), [2, 3, 4]);
    assert.ok(tables(db).includes("deployments"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM login_attempts").get()?.n, 1);
    db.close();
  });

  it("002 rejects unknown triggers and statuses", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);
    assert.throws(() => db.prepare("INSERT INTO deployments (app, trigger, status, started_at) VALUES ('a', 'nope', 'running', 1)").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO deployments (app, trigger, status, started_at) VALUES ('a', 'create', 'nope', 1)").run(), /CHECK/);
    db.prepare("INSERT INTO deployments (app, trigger, status, started_at) VALUES ('a', 'rollback', 'running', 1)").run();
    db.prepare("INSERT INTO deployments (app, trigger, status, started_at) VALUES ('a', 'build', 'running', 1)").run();
    db.close();
  });
});
