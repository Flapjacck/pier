import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import type { Config } from "../../src/config.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";

const testConfig: Config = {
  port: 3000,
  host: "127.0.0.1",
  apiToken: undefined,
  kubeconfig: undefined,
  namespace: "pier-apps",
};

describe("GET /health", () => {
  it("returns 200 with service identity", async () => {
    const app = buildApp(testConfig, {
      logger: false,
      k8s: createFakeClientsResult(),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
    await app.close();
  });
});
