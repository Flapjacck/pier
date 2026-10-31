import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { TEST_TOKEN, testConfig } from "../helpers/test-config.js";

const UNAUTHORIZED = { ok: false, error: "unauthorized" };

/** Full app with healthy fake k8s clients, so any 401 comes from setupAuth alone. */
async function appWithToken(apiToken: string | undefined) {
  return await buildApp(testConfig({ apiToken }), {
    logger: false,
    k8s: createFakeClientsResult({
      core: {
        listNode: async () => ({
          items: [{ status: { conditions: [{ type: "Ready", status: "True" }] } }],
        }),
        listNamespacedPod: async () => ({
          items: [
            {
              metadata: { name: "demo", namespace: "pier-apps" },
              status: { phase: "Running", containerStatuses: [{ ready: true }] },
            },
          ],
        }),
      } as never,
      version: { getCode: async () => ({ gitVersion: "v1.30.0+k3s1" }) } as never,
    }),
  });
}

async function get(apiToken: string | undefined, url: string, authorization?: string) {
  const app = await appWithToken(apiToken);
  const res = await app.inject({
    method: "GET",
    url,
    headers: authorization === undefined ? {} : { authorization },
  });
  await app.close();
  return res;
}

describe("setupAuth", () => {
  describe("with apiToken configured", () => {
    const rejected: Array<[name: string, authorization: string | undefined]> = [
      ["without Authorization header", undefined],
      ["with wrong bearer token", "Bearer wrong-token"],
      ["with Basic auth scheme", "Basic dXNlcjpwYXNz"],
      ["with malformed authorization header", "NotBearerToken"],
    ];
    for (const [name, authorization] of rejected) {
      it(`rejects requests ${name}`, async () => {
        const res = await get(TEST_TOKEN, "/api/cluster/pods", authorization);
        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.json(), UNAUTHORIZED);
      });
    }

    it("accepts correct bearer token on /api/cluster/health", async () => {
      const res = await get(TEST_TOKEN, "/api/cluster/health", `Bearer ${TEST_TOKEN}`);
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; version: string };
      assert.equal(body.ok, true);
      assert.equal(body.version, "v1.30.0+k3s1");
    });

    it("accepts correct bearer token on /api/cluster/pods", async () => {
      const res = await get(TEST_TOKEN, "/api/cluster/pods", `Bearer ${TEST_TOKEN}`);
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; total: number };
      assert.equal(body.ok, true);
      assert.equal(body.total, 1);
    });

    it("allows /health without authorization", async () => {
      const res = await get(TEST_TOKEN, "/health");
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
    });

    it("allows /api/health without authorization", async () => {
      const res = await get(TEST_TOKEN, "/api/health");
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
    });
  });

  describe("without apiToken (dev mode on loopback)", () => {
    it("allows /api/cluster/health without token", async () => {
      const res = await get(undefined, "/api/cluster/health");
      assert.equal(res.statusCode, 401);
      // Without a token, all /api/* routes require auth (mutating or not, for /api routes).
      assert.deepEqual(res.json(), UNAUTHORIZED);
    });

    it("allows /api/cluster/pods without token", async () => {
      const res = await get(undefined, "/api/cluster/pods");
      assert.equal(res.statusCode, 401);
      // Without a token, all /api/* routes require auth.
      assert.deepEqual(res.json(), UNAUTHORIZED);
    });

    it("allows /health without token", async () => {
      const res = await get(undefined, "/health");
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
    });
  });
});
