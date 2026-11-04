import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LOGIN_WINDOW_MS, SqliteLoginLimiter } from "../../src/db/login-limiter.js";
import { openDatabase } from "../../src/db/open.js";

function failTimes(limiter: SqliteLoginLimiter, ip: string, n: number, now: number): void {
  for (let i = 0; i < n; i++) limiter.recordFailure(ip, now);
}

describe("SqliteLoginLimiter", () => {
  it("limits an IP after 5 failures in the window, per IP", () => {
    const limiter = new SqliteLoginLimiter(openDatabase(":memory:"));
    failTimes(limiter, "a", 4, 1000);
    assert.equal(limiter.isLimited("a", 1000), false);
    limiter.recordFailure("a", 1000);
    assert.equal(limiter.isLimited("a", 1000), true);
    assert.equal(limiter.isLimited("b", 1000), false);
  });

  it("keeps the window anchored at the first failure", () => {
    const limiter = new SqliteLoginLimiter(openDatabase(":memory:"));
    limiter.recordFailure("a", 0);
    failTimes(limiter, "a", 4, LOGIN_WINDOW_MS - 1);
    assert.equal(limiter.isLimited("a", LOGIN_WINDOW_MS), true, "still inside the first window");
    assert.equal(limiter.isLimited("a", LOGIN_WINDOW_MS + 1), false, "window ended");
  });

  it("starts a fresh window once the old one has passed", () => {
    const limiter = new SqliteLoginLimiter(openDatabase(":memory:"));
    failTimes(limiter, "a", 5, 0);
    limiter.recordFailure("a", LOGIN_WINDOW_MS + 1);
    assert.equal(limiter.isLimited("a", LOGIN_WINDOW_MS + 1), false);
    failTimes(limiter, "a", 4, LOGIN_WINDOW_MS + 2);
    assert.equal(limiter.isLimited("a", LOGIN_WINDOW_MS + 2), true);
  });

  it("clears an IP on success", () => {
    const limiter = new SqliteLoginLimiter(openDatabase(":memory:"));
    failTimes(limiter, "a", 5, 0);
    limiter.clear("a");
    assert.equal(limiter.isLimited("a", 0), false);
  });

  it("prunes only windows that have ended", () => {
    const db = openDatabase(":memory:");
    const limiter = new SqliteLoginLimiter(db);
    limiter.recordFailure("old", 0);
    limiter.recordFailure("new", 10_000);
    assert.equal(limiter.prune(LOGIN_WINDOW_MS + 1), 1);
    const left = db.prepare("SELECT ip FROM login_attempts").all().map((r) => r.ip);
    assert.deepEqual(left, ["new"]);
  });

  it("survives a restart (close and reopen the same file)", () => {
    const dir = mkdtempSync(join(tmpdir(), "pier-limiter-"));
    try {
      const path = join(dir, "pier.db");
      const first = openDatabase(path);
      failTimes(new SqliteLoginLimiter(first), "a", 5, 1000);
      first.close();
      const second = openDatabase(path);
      assert.equal(new SqliteLoginLimiter(second).isLimited("a", 2000), true);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
