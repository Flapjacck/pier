import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { V1Deployment } from "@kubernetes/client-node";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, FakeApiError } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

const fakeDeployment: V1Deployment = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "hello",
    uid: "dep-uid-123",
    labels: { "pier.app": "hello" },
  },
  spec: {
    replicas: 1,
    selector: { matchLabels: { "pier.app": "hello" } },
    template: {
      spec: {
        containers: [{ name: "app", image: "nginx:1.27" }],
      },
    },
  },
  status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
};

describe("POST /api/apps error handling", () => {
  it("returns 400 with details when body is missing required field", async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error?: string; details?: string };
    assert.equal(body.error, "invalid request");
    assert.ok(body.details);
    await app.close();
  });

  it("returns 400 with details when body is an array", async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: [],
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error?: string; details?: string };
    assert.equal(body.error, "invalid request");
    assert.ok(body.details);
    await app.close();
  });

  it("returns 400 with details when missing required name", async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error?: string; details?: string };
    assert.equal(body.error, "invalid request");
    assert.ok(body.details);
    assert.match(body.details!, /name/i);
    await app.close();
  });

  it("returns 400 with details for unknown property", async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        unknownProperty: "not allowed",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error?: string; details?: string };
    assert.equal(body.error, "invalid request");
    assert.ok(body.details);
    // AJV message format: "must NOT have additional properties"
    assert.match(body.details!, /additional properties|unknownProperty/i);
    await app.close();
  });

  it("returns 400 for port: 0", async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 0 },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { details?: string };
    assert.ok(body.details);
    await app.close();
  });

  it("returns 400 for replicas: 11", async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80, replicas: 11 },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { details?: string };
    assert.ok(body.details);
    await app.close();
  });

  it("returns 403 for quota exceeded error with details", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => {
          // Simulate a 403 with message in body (API-like error)
          const err: unknown = new Error("quota exceeded: pier-apps-quota");
          (err as Record<string, unknown>).statusCode = 403;
          (err as Record<string, unknown>).body = JSON.stringify({
            message: "exceeded quota: pier-apps-quota",
          });
          throw err;
        },
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    };

    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeClients.apps as never,
        core: fakeClients.core as never,
        networking: fakeClients.networking as never,
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 403);
    const body = res.json() as { error?: string; details?: string };
    assert.equal(body.error, "quota exceeded");
    assert.ok(body.details);
    await app.close();
  });

  it("returns 422 for VAP/Pod Security rejection", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => {
          const err: unknown = new Error("pod security: pod does not meet baseline");
          (err as Record<string, unknown>).statusCode = 422;
          throw err;
        },
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    };

    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeClients.apps as never,
        core: fakeClients.core as never,
        networking: fakeClients.networking as never,
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { error?: string };
    assert.equal(body.error, "rejected by cluster");
    await app.close();
  });

  it("returns 503 for connection error", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => {
          throw new Error("ECONNREFUSED");
        },
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    };

    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeClients.apps as never,
        core: fakeClients.core as never,
        networking: fakeClients.networking as never,
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { error?: string; details?: string };
    assert.equal(body.error, "cluster unreachable");
    // Should not echo the raw error message to the client
    assert.ok(!body.details?.includes("ECONNREFUSED"));
    await app.close();
  });

  it("lowercases host and does case-insensitive host-in-use check", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
      },
      networking: {
        listNamespacedIngress: async () => ({
          items: [
            {
              spec: {
                rules: [{ host: "HELLO.192.0.2.10.nip.io" }],
              },
            },
          ],
        }),
      },
    };

    const app = await buildApp(testConfig({ ingressDomain: "192.0.2.10.nip.io" }), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeClients.apps as never,
        networking: fakeClients.networking as never,
      }),
    });

    // Request with lowercase host should conflict with uppercase in Ingress
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: {
        name: "newapp",
        image: "nginx:1.27",
        port: 80,
        host: "hello.192.0.2.10.nip.io",
      },
    });
    assert.equal(res.statusCode, 409);
    const body = res.json() as { error?: string };
    assert.match(body.error!, /host already in use/);
    await app.close();
  });

  it("normalizes uppercase host to lowercase for creation", async () => {
    let capturedHost: string | undefined;
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => fakeDeployment,
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        createNamespacedIngress: async (params: Record<string, unknown>) => {
          const body = params.body as Record<string, unknown>;
          const spec = body.spec as Record<string, unknown>;
          const rules = spec.rules as Array<Record<string, unknown>>;
          capturedHost = rules[0].host as string;
          return {};
        },
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    };

    const app = await buildApp(testConfig({ ingressDomain: "192.0.2.10.nip.io" }), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: fakeClients.apps as never,
        core: fakeClients.core as never,
        networking: fakeClients.networking as never,
      }),
    });

    await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        host: "HELLO.192.0.2.10.nip.io",
      },
    });
    assert.equal(capturedHost, "hello.192.0.2.10.nip.io");
    await app.close();
  });
});
