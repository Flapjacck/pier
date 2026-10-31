import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { V1Deployment } from "@kubernetes/client-node";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, createFailedClientsResult, FakeApiError } from "../helpers/fake-clients.js";
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

describe("POST /apps", () => {
  it("returns 401 without a bearer token when auth is configured (mutating endpoints always require auth)", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns 401 even without apiToken (mutating endpoints always require auth, no loopback bypass)", async () => {
    const app = buildApp(testConfig({ apiToken: undefined }), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns 201 with app details on success", async () => {
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
        createNamespacedIngress: async () => ({}),
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeClients.apps as never, core: fakeClients.core as never, networking: fakeClients.networking as never }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { name: string; image: string };
    assert.equal(body.name, "hello");
    assert.equal(body.image, "nginx:1.27");
    await app.close();
  });

  it("returns 400 for invalid name (leading digit)", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "1bad", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for invalid name (uppercase)", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "Hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for port out of range", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 0 },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for replicas out of range", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80, replicas: 11 },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for bad env key", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        env: { "123invalid": "value" },
      },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for extra property", async () => {
    const app = buildApp(testConfig(), { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        extraProp: "not allowed",
      },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 when host provided but ingressDomain not configured", async () => {
    const app = buildApp(testConfig({ ingressDomain: undefined }), {
      logger: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        host: "hello.example.com",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { details?: string };
    assert.match(body.details || "", /ingress not configured/);
    await app.close();
  });

  it("returns 400 when host does not end with ingressDomain", async () => {
    const app = buildApp(testConfig({ ingressDomain: "example.com" }), {
      logger: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        host: "hello.other.com",
      },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 when host contains wildcard", async () => {
    const app = buildApp(testConfig({ ingressDomain: "example.com" }), {
      logger: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        host: "*.example.com",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { details?: string };
    assert.match(body.details || "", /wildcard/i);
    await app.close();
  });

  it("returns 400 when host has invalid DNS-1123 format", async () => {
    const app = buildApp(testConfig({ ingressDomain: "example.com" }), {
      logger: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "hello",
        image: "nginx:1.27",
        port: 80,
        host: "-invalid.example.com",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { details?: string };
    assert.match(body.details || "", /DNS-1123|hostname/i);
    await app.close();
  });

  it("returns 409 when app already exists", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => ({ metadata: { name: "hello" } }),
      },
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeClients.apps as never }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 409);
    const body = res.json() as { error: string };
    assert.match(body.error, /already exists/);
    await app.close();
  });

  it("returns 409 when host already in use", async () => {
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
                rules: [{ host: "hello.example.com" }],
              },
            },
          ],
        }),
      },
    };

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeClients.apps as never, networking: fakeClients.networking as never }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: {
        name: "newapp",
        image: "nginx:1.27",
        port: 80,
        host: "hello.example.com",
      },
    });
    assert.equal(res.statusCode, 409);
    const body = res.json() as { error: string };
    assert.match(body.error, /host already in use/);
    await app.close();
  });

  it("returns 503 when kubeconfig failed to load", async () => {
    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFailedClientsResult(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(res.statusCode, 503);
    await app.close();
  });

  it("defaults replicas to 1 when not provided", async () => {
    let capturedReplicas: number | undefined;
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async ({ body }: { body: V1Deployment }) => {
          capturedReplicas = body.spec?.replicas;
          return fakeDeployment;
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

    const app = buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeClients.apps as never, core: fakeClients.core as never, networking: fakeClients.networking as never }),
    });

    await app.inject({
      method: "POST",
      url: "/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80 },
    });
    assert.equal(capturedReplicas, 1);
    await app.close();
  });
});
