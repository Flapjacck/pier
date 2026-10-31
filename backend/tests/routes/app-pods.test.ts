import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

interface ApiError extends Error {
  code?: number;
}

describe("GET /apps/:name/pods", () => {
  it("returns 400 for invalid app name", async () => {
    const app = buildApp(testConfig(), { logger: false, k8s: createFakeClientsResult() });
    const res = await app.inject({
      method: "GET",
      url: "/apps/Invalid-Name/pods",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { ok: false, error: "invalid request" });
    await app.close();
  });

  it("returns 404 when app does not exist", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => {
        const err = new Error("Not Found") as ApiError;
        err.code = 404;
        throw err;
      },
    };
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/nope/pods",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { ok: false, error: "app not found" });
    await app.close();
  });

  it("returns 200 with empty array when app has no pods (scaled to 0)", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => ({}),
    };
    const fakeCore = {
      listNamespacedPod: async () => ({ items: [] }),
    };
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeApps as never,
        core: fakeCore as never,
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/pods",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
    await app.close();
  });

  it("returns 200 with pods list", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => ({}),
    };
    const fakeCore = {
      listNamespacedPod: async () => ({
        items: [
          {
            metadata: { name: "hello-pod-1" },
            status: {
              phase: "Running",
              startTime: new Date("2026-10-29T15:00:00.000Z"),
              containerStatuses: [{ ready: true, restartCount: 0 }],
            },
          },
        ],
      }),
    };
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeApps as never,
        core: fakeCore as never,
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/pods",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    const pods = res.json() as Array<Record<string, unknown>>;
    assert.equal(pods.length, 1);
    assert.equal(pods[0]?.name, "hello-pod-1");
    assert.equal(pods[0]?.ready, true);
    await app.close();
  });

  it("returns 503 when cluster unreachable", async () => {
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: { ok: false, error: new Error("no cluster") },
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/pods",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { ok: false, error: "cluster unreachable" });
    await app.close();
  });
});

describe("GET /apps/:name/logs", () => {
  it("returns 400 for invalid tail parameter", async () => {
    const app = buildApp(testConfig(), { logger: false, k8s: createFakeClientsResult() });
    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/logs?tail=0",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for tail > 5000", async () => {
    const app = buildApp(testConfig(), { logger: false, k8s: createFakeClientsResult() });
    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/logs?tail=5001",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for invalid app name", async () => {
    const app = buildApp(testConfig(), { logger: false, k8s: createFakeClientsResult() });
    const res = await app.inject({
      method: "GET",
      url: "/apps/Invalid/logs",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 404 when app does not exist (logs)", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => {
        const err = new Error("Not Found") as ApiError;
        err.code = 404;
        throw err;
      },
    };
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/nope/logs",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { ok: false, error: "app not found" });
    await app.close();
  });

  it("returns 404 when app has no pods", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => ({}),
    };
    const fakeCore = {
      listNamespacedPod: async () => ({ items: [] }),
    };
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeApps as never,
        core: fakeCore as never,
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/logs",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { ok: false, error: "no pods" });
    await app.close();
  });

  it("returns 404 for non-existent pod name", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => ({}),
    };
    const fakeCore = {
      listNamespacedPod: async () => ({
        items: [
          {
            metadata: { name: "hello-pod-1" },
            status: {
              phase: "Running",
              containerStatuses: [{ ready: true, restartCount: 0 }],
            },
          },
        ],
      }),
    };
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeApps as never,
        core: fakeCore as never,
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/logs?pod=wrong-pod",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { ok: false, error: "pod not found" });
    await app.close();
  });

  it("returns 503 when cluster unreachable", async () => {
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: { ok: false, error: new Error("no cluster") },
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/logs",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { ok: false, error: "cluster unreachable" });
    await app.close();
  });
});
