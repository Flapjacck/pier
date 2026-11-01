import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, FakeApiError } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";
import { APP_LABEL } from "../../src/k8s/labels.js";

const liveDeployment = {
  metadata: {
    name: "hello",
    labels: { [APP_LABEL]: "hello" },
    creationTimestamp: new Date("2026-10-29T15:00:00.000Z"),
  },
  spec: {
    replicas: 1,
    selector: { matchLabels: { [APP_LABEL]: "hello" } },
    template: {
      spec: {
        containers: [
          { name: "app", image: "nginx:1.27", ports: [{ name: "http", containerPort: 8080 }] },
        ],
      },
    },
  },
  status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
};

function appsClient(overrides: Record<string, unknown> = {}) {
  return {
    readNamespacedDeployment: async () => liveDeployment,
    replaceNamespacedDeploymentScale: async () => ({}),
    patchNamespacedDeployment: async () => liveDeployment,
    deleteNamespacedDeployment: async () => ({}),
    ...overrides,
  };
}

describe("app action routes", () => {
  it("returns 400 for invalid names on scale, restart, and delete", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: appsClient() as never }),
    });

    for (const method of ["PATCH", "POST", "DELETE"] as const) {
      const url =
        method === "PATCH"
          ? "/api/apps/BAD/scale"
          : method === "POST"
            ? "/api/apps/BAD/restart"
            : "/api/apps/BAD";
      const res = await app.inject({
        method,
        url,
        headers: authHeader,
        payload: method === "PATCH" ? { replicas: 1 } : undefined,
      });
      assert.equal(res.statusCode, 400, `${method} invalid name`);
    }
    await app.close();
  });

  it("returns 401 without auth on scale, restart, and delete", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: appsClient() as never }),
    });

    const scale = await app.inject({
      method: "PATCH",
      url: "/api/apps/hello/scale",
      payload: { replicas: 2 },
    });
    assert.equal(scale.statusCode, 401);

    const restart = await app.inject({ method: "POST", url: "/api/apps/hello/restart" });
    assert.equal(restart.statusCode, 401);

    const del = await app.inject({ method: "DELETE", url: "/api/apps/hello" });
    assert.equal(del.statusCode, 401);
    await app.close();
  });

  it("returns 404 for missing, terminating, and unlabelled deployments", async () => {
    const terminating = {
      ...liveDeployment,
      metadata: { ...liveDeployment.metadata, deletionTimestamp: new Date() },
    };
    const unlabelled = {
      ...liveDeployment,
      metadata: { name: "hello", labels: {} },
    };

    const cases: Array<{ label: string; read: () => unknown }> = [
      {
        label: "missing",
        read: () => {
          throw new FakeApiError(404);
        },
      },
      { label: "terminating", read: () => terminating },
      { label: "unlabelled", read: () => unlabelled },
    ];

    for (const testCase of cases) {
      const app = await buildApp(testConfig(), {
        logger: false,
        k8s: createFakeClientsResult({
          apps: appsClient({
            readNamespacedDeployment: async () => testCase.read(),
          }) as never,
        }),
      });

      const scale = await app.inject({
        method: "PATCH",
        url: "/api/apps/hello/scale",
        headers: authHeader,
        payload: { replicas: 0 },
      });
      assert.equal(scale.statusCode, 404, `scale ${testCase.label}`);

      const restart = await app.inject({
        method: "POST",
        url: "/api/apps/hello/restart",
        headers: authHeader,
      });
      assert.equal(restart.statusCode, 404, `restart ${testCase.label}`);

      await app.close();
    }
  });

  it("scale and restart succeed for a live app", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: appsClient() as never }),
    });

    const scale = await app.inject({
      method: "PATCH",
      url: "/api/apps/hello/scale",
      headers: authHeader,
      payload: { replicas: 2 },
    });
    assert.equal(scale.statusCode, 200);
    assert.equal((scale.json() as { name: string }).name, "hello");

    const restart = await app.inject({
      method: "POST",
      url: "/api/apps/hello/restart",
      headers: authHeader,
    });
    assert.equal(restart.statusCode, 202);
    assert.equal((restart.json() as { ok: boolean }).ok, true);
    await app.close();
  });

  it("DELETE returns 204 for orphan Service and Ingress without Deployment", async () => {
    let svcDeleted = false;
    let ingDeleted = false;
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: {
          readNamespacedDeployment: async () => {
            throw new FakeApiError(404);
          },
        } as never,
        core: {
          readNamespacedService: async () => ({
            metadata: { labels: { [APP_LABEL]: "hello" } },
          }),
          deleteNamespacedService: async () => {
            svcDeleted = true;
          },
        } as never,
        networking: {
          readNamespacedIngress: async () => ({
            metadata: { labels: { [APP_LABEL]: "hello" } },
          }),
          deleteNamespacedIngress: async () => {
            ingDeleted = true;
          },
        } as never,
      }),
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 204);
    assert.equal(svcDeleted, true);
    assert.equal(ingDeleted, true);
    await app.close();
  });

  it("keeps details on validation errors", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: appsClient() as never }),
    });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/apps/BAD",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { details?: string }).details, "name must match DNS-1035 pattern");
    await app.close();
  });
});
