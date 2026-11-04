import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openDatabase } from "../../src/db/open.js";

describe("openDatabase", () => {
  it("creates the parent directory, enables WAL and runs migrations", () => {
    const dir = mkdtempSync(join(tmpdir(), "pier-db-"));
    try {
      const path = join(dir, "nested", "pier.db");
      const db = openDatabase(path);
      assert.ok(existsSync(path));
      assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
      assert.equal(db.prepare("PRAGMA busy_timeout").get()?.timeout, 5000);
      assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n, 1);
      db.close();
      // Reopening the same file is fine and doesn't re-run anything.
      const again = openDatabase(path);
      assert.equal(again.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n, 1);
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("opens an in-memory database without touching the filesystem", () => {
    const db = openDatabase(":memory:");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log").get()?.n, 0);
    db.close();
    assert.ok(!existsSync(":memory:"));
  });
});
