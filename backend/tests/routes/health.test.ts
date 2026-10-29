import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns 200 with service identity", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
    await app.close();
  });
});
