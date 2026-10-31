import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import {
  createFakeClientsResult,
  createFailedClientsResult,
} from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

describe("GET /cluster/health", () => {
  it("returns 200 when the cluster check passes", async () => {
    const fakeCore = {
      listNode: async () => ({
        items: [{ status: { conditions: [{ type: "Ready", status: "True" }] } }],
      }),
    };
    const fakeVersion = {
      getCode: async () => ({ gitVersion: "v1.30.0+k3s1" }),
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ core: fakeCore as never, version: fakeVersion as never }),
    });

    const res = await app.inject({ method: "GET", url: "/cluster/health", headers: authHeader });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; version: string };
    assert.equal(body.ok, true);
    assert.equal(body.version, "v1.30.0+k3s1");
    await app.close();
  });

  it("returns 503 when kubeconfig failed to load", async () => {
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFailedClientsResult("cannot read kubeconfig"),
    });

    const res = await app.inject({ method: "GET", url: "/cluster/health", headers: authHeader });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    // Ensure the response does not contain the raw error message.
    const responseText = res.body;
    assert(!responseText.includes("cannot read kubeconfig"));
    await app.close();
  });

  it("returns 503 with generic error when the cluster check fails", async () => {
    const fakeCore = {
      listNode: async () => {
        throw new Error("Forbidden: cannot access nodes");
      },
    };
    const fakeVersion = {
      getCode: async () => ({ gitVersion: "v1.30.0+k3s1" }),
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        core: fakeCore as never,
        version: fakeVersion as never,
        mode: "in-cluster",
      }),
    });

    const res = await app.inject({ method: "GET", url: "/cluster/health", headers: authHeader });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    // Ensure the response does not contain the raw error message.
    const responseText = res.body;
    assert(!responseText.includes("Forbidden"));
    assert(!responseText.includes("cannot access"));
    await app.close();
  });
});

describe("GET /cluster/pods", () => {
  it("returns 200 with pod list on success (namespaced)", async () => {
    let capturedNamespace: string | undefined;
    const fakeCore = {
      listNamespacedPod: async (params: { namespace: string }) => {
        capturedNamespace = params.namespace;
        return {
          items: [
            {
              metadata: { name: "demo", namespace: "pier-apps" },
              status: { phase: "Running", containerStatuses: [{ ready: true }] },
            },
          ],
        };
      },
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ core: fakeCore as never }),
    });

    const res = await app.inject({ method: "GET", url: "/cluster/pods", headers: authHeader });
    assert.equal(res.statusCode, 200);
    assert.equal(capturedNamespace, "pier-apps");
    const body = res.json() as { ok: boolean; total: number };
    assert.equal(body.ok, true);
    assert.equal(body.total, 1);
    await app.close();
  });

  it("returns 503 when kubeconfig failed to load", async () => {
    const app = buildApp(testConfig(), { logger: false, k8s: createFailedClientsResult() });

    const res = await app.inject({ method: "GET", url: "/cluster/pods", headers: authHeader });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    await app.close();
  });

  it("returns 503 with generic error when Kubernetes call fails", async () => {
    const fakeCore = {
      listNamespacedPod: async () => {
        throw new Error("Forbidden: cannot list pods");
      },
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ core: fakeCore as never, mode: "in-cluster" }),
    });

    const res = await app.inject({ method: "GET", url: "/cluster/pods", headers: authHeader });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    // Ensure the response does not contain the raw error message.
    const responseText = res.body;
    assert(!responseText.includes("Forbidden"));
    assert(!responseText.includes("cannot list pods"));
    await app.close();
  });
});
