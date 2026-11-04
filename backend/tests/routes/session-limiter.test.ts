import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { TEST_TOKEN, testConfig } from "../helpers/test-config.js";

async function appAt(dbPath: string) {
  return await buildApp(testConfig({ dbPath }), { logger: false, k8s: createFakeClientsResult({}) });
}

const login = (token: string) => ({ method: "POST" as const, url: "/api/login", payload: { token } });

describe("login limiter (SQLite)", () => {
  it("a successful login after 5 failures resets the count", async () => {
    const app = await appAt(":memory:");
    for (let i = 0; i < 4; i++) assert.equal((await app.inject(login("bad"))).statusCode, 401);
    assert.equal((await app.inject(login(TEST_TOKEN))).statusCode, 204);
    for (let i = 0; i < 5; i++) assert.equal((await app.inject(login("bad"))).statusCode, 401, `attempt ${i + 1}`);
    assert.equal((await app.inject(login("bad"))).statusCode, 429);
    await app.close();
  });

  it("is still limited after the server restarts on the same DB file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pier-login-"));
    try {
      const path = join(dir, "pier.db");
      const first = await appAt(path);
      for (let i = 0; i < 5; i++) await first.inject(login("bad"));
      await first.close();
      const second = await appAt(path);
      const res = await second.inject(login(TEST_TOKEN));
      assert.equal(res.statusCode, 429, "even the right token waits out the window");
      assert.deepEqual(res.json(), { ok: false, error: "too many attempts" });
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
