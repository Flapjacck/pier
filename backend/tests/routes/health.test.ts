import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { testConfig } from "../helpers/test-config.js";

describe("GET /health", () => {
  it("returns 200 with service identity", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
    await app.close();
  });
});
