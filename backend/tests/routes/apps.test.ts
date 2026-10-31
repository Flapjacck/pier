import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, createFailedClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

describe("GET /api/apps", () => {
  it("returns 401 without a bearer token when auth is configured", async () => {
    const fakeApps = {
      listNamespacedDeployment: async () => ({ items: [] }),
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({ method: "GET", url: "/api/apps" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns the app list with a valid token", async () => {
    const fakeApps = {
      listNamespacedDeployment: async () => ({
        items: [
          {
            metadata: { name: "hello", labels: { "pier.app": "hello" } },
            spec: { replicas: 1, template: { spec: { containers: [{ image: "nginx:1.27" }] } } },
            status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
          },
        ],
      }),
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Array<{ name: string }>;
    assert.equal(body.length, 1);
    assert.equal(body[0]?.name, "hello");
    await app.close();
  });

  it("returns an empty array when there are no apps", async () => {
    const fakeApps = {
      listNamespacedDeployment: async () => ({ items: [] }),
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
    await app.close();
  });

  it("returns 503 when kubeconfig failed to load", async () => {
    const app = await buildApp(testConfig(), { logger: false, k8s: createFailedClientsResult() });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    await app.close();
  });

  it("returns 503 with a generic body when listApps throws", async () => {
    const fakeApps = {
      listNamespacedDeployment: async () => {
        throw new Error("Forbidden: cannot list deployments");
      },
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    assert(!res.body.includes("Forbidden"));
    await app.close();
  });

  it("passes the configured namespace to listApps", async () => {
    let seenNamespace: string | undefined;
    const fakeApps = {
      listNamespacedDeployment: async ({ namespace }: { namespace: string }) => {
        seenNamespace = namespace;
        return { items: [] };
      },
    };
    const app = await buildApp(testConfig({ namespace: "custom-ns" }), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    await app.inject({
      method: "GET",
      url: "/api/apps",
      headers: authHeader,
    });
    assert.equal(seenNamespace, "custom-ns");
    await app.close();
  });
});
