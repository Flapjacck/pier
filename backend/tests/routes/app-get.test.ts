import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppsV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, createFailedClientsResult, FakeApiError } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

const testDeployment = {
  metadata: { name: "hello", labels: { "pier.app": "hello" } },
  spec: {
    replicas: 1,
    template: {
      spec: {
        containers: [
          {
            image: "nginx:1.27",
            ports: [{ name: "http", containerPort: 8080 }],
          },
        ],
      },
    },
  },
  status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
};

const testIngress = {
  metadata: { name: "hello", labels: { "pier.app": "hello" } },
  spec: {
    rules: [{ host: "hello.192.0.2.10.nip.io" }],
  },
};

describe("GET /api/apps/:name", () => {
  it("returns 401 without a bearer token when auth is configured", async () => {
    const fakeApps = {
      readNamespacedDeployment: async () => testDeployment,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({ apps: fakeApps as never }),
    });

    const res = await app.inject({ method: "GET", url: "/api/apps/hello" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns 200 for a found app with an Ingress; includes port, host and url", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => testDeployment,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.name, "hello");
    assert.equal(body.port, 8080);
    assert.equal(body.host, "hello.192.0.2.10.nip.io");
    assert.equal(body.url, "http://hello.192.0.2.10.nip.io");
    await app.close();
  });

  it("returns 200 for a found app with no Ingress (404 from readNamespacedIngress); host/url are absent", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => testDeployment,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => {
          throw new FakeApiError(404);
        },
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.name, "hello");
    assert.equal(body.port, 8080);
    assert.equal("host" in body, false);
    assert.equal("url" in body, false);
    await app.close();
  });

  it("returns 404 for an unknown app", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/unknown",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "app not found");
    await app.close();
  });

  it("returns 404 for a terminating app", async () => {
    const terminatingDeploy = {
      ...testDeployment,
      metadata: { ...testDeployment.metadata, deletionTimestamp: new Date() },
    };
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => terminatingDeploy,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.error, "app not found");
    await app.close();
  });

  it("returns 404 for an unlabelled Deployment", async () => {
    const unlabelledDeploy = {
      ...testDeployment,
      metadata: { ...testDeployment.metadata, labels: {} },
    };
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => unlabelledDeploy,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.error, "app not found");
    await app.close();
  });

  it("returns 400 for a bad name such as Bad_Name", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => testDeployment,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/Bad_Name",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid request");
    await app.close();
  });

  it("returns 503 when the k8s client fails to load", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFailedClientsResult(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    await app.close();
  });

  it("returns 503 when the read throws a 500", async () => {
    const fakeClients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(500, "Internal Server Error");
        },
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult(fakeClients as never),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/apps/hello",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    await app.close();
  });
});
