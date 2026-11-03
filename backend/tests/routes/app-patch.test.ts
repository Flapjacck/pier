import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { V1Deployment } from "@kubernetes/client-node";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, FakeApiError } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

function live(): V1Deployment {
  return {
    metadata: { name: "hello", labels: { "pier.app": "hello" }, creationTimestamp: new Date("2026-11-02T15:00:00Z") },
    spec: {
      replicas: 1,
      selector: {},
      template: {
        spec: {
          containers: [
            {
              name: "app",
              image: "nginx:1.27",
              ports: [{ name: "http", containerPort: 8080 }],
              env: [{ name: "A", value: "1" }],
            },
          ],
        },
      },
    },
    status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
  };
}

type Opts = {
  read?: () => Promise<V1Deployment>;
  patch?: () => Promise<unknown>;
  quotaUsed?: Record<string, string>;
};

async function build(opts: Opts = {}) {
  const patches: unknown[] = [];
  const k8s = createFakeClientsResult({
    apps: {
      readNamespacedDeployment: opts.read ?? (async () => live()),
      patchNamespacedDeployment: async (req: { body: unknown }) => {
        patches.push(req.body);
        return opts.patch ? opts.patch() : live();
      },
    } as never,
    core: {
      listNamespacedLimitRange: async () => ({
        items: [{ spec: { limits: [{ type: "Container", max: { cpu: "2", memory: "2Gi" } }] } }],
      }),
      listNamespacedResourceQuota: async () => ({
        items: [{ status: { hard: { "requests.cpu": "2", "limits.memory": "6Gi" }, used: opts.quotaUsed ?? {} } }],
      }),
      patchNamespacedService: async () => ({}),
    } as never,
    networking: {
      readNamespacedIngress: async () => {
        throw new FakeApiError(404);
      },
    } as never,
  });
  const app = await buildApp(testConfig(), { logger: false, k8s });
  return { app, patches };
}

function patch(app: Awaited<ReturnType<typeof build>>["app"], payload: unknown, name = "hello", auth = true) {
  return app.inject({
    method: "PATCH",
    url: `/api/apps/${name}`,
    headers: auth ? authHeader : {},
    payload: payload as Record<string, unknown>,
  });
}

describe("PATCH /api/apps/:name", () => {
  it("returns 200 with the app, including env and resources", async () => {
    const { app, patches } = await build();
    const res = await patch(app, { image: "nginx:1.28", resources: { limits: { memory: "512Mi" } } });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { name: string; env?: Record<string, string>; resources?: { limits: { cpu: string } } };
    assert.equal(body.name, "hello");
    assert.deepEqual(body.env, { A: "1" });
    assert.equal(body.resources?.limits.cpu, "500m");
    assert.equal(patches.length, 1);
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const { app } = await build();
    assert.equal((await patch(app, { replicas: 2 }, "hello", false)).statusCode, 401);
    await app.close();
  });

  it("returns 400 for an invalid name, an empty body or unknown fields", async () => {
    const { app, patches } = await build();
    assert.equal((await patch(app, { replicas: 2 }, "BAD")).statusCode, 400);
    assert.equal((await patch(app, {})).statusCode, 400);
    assert.equal((await patch(app, { name: "other" })).statusCode, 400);
    assert.equal(patches.length, 0);
    await app.close();
  });

  it("returns 400 for malformed quantities", async () => {
    const { app } = await build();
    assert.equal((await patch(app, { resources: { limits: { cpu: "lots" } } })).statusCode, 400);
    assert.equal((await patch(app, { resources: { limits: { memory: "512M" } } })).statusCode, 400);
    await app.close();
  });

  it("returns 400 when a limit is below its request or above the namespace max", async () => {
    const { app, patches } = await build();
    const below = await patch(app, { resources: { requests: { cpu: "1" } } });
    assert.equal(below.statusCode, 400);
    assert.match((below.json() as { details: string }).details, /limits\.cpu must be at least/);
    const above = await patch(app, { resources: { limits: { memory: "3Gi" } } });
    assert.equal(above.statusCode, 400);
    assert.match((above.json() as { details: string }).details, /max of 2Gi/);
    assert.equal(patches.length, 0);
    await app.close();
  });

  it("returns 403 when the change won't fit the quota", async () => {
    const { app, patches } = await build({ quotaUsed: { "requests.cpu": "1900m" } });
    const res = await patch(app, { replicas: 5 });
    assert.equal(res.statusCode, 403);
    assert.equal((res.json() as { error: string }).error, "quota exceeded");
    assert.equal(patches.length, 0);
    await app.close();
  });

  it("returns 404 for a missing app", async () => {
    const { app } = await build({ read: async () => { throw new FakeApiError(404); } });
    assert.equal((await patch(app, { replicas: 2 })).statusCode, 404);
    await app.close();
  });

  it("returns 422 when the cluster rejects the patch and 503 on other errors", async () => {
    const rejected = await build({ patch: async () => { throw new FakeApiError(422, "invalid"); } });
    assert.equal((await patch(rejected.app, { image: "nginx:1.28" })).statusCode, 422);
    await rejected.app.close();
    const down = await build({ patch: async () => { throw new FakeApiError(500); } });
    assert.equal((await patch(down.app, { image: "nginx:1.28" })).statusCode, 503);
    await down.app.close();
  });
});

describe("POST /api/apps with resources", () => {
  async function buildCreate(quotaUsed: Record<string, string> = {}) {
    const created: V1Deployment[] = [];
    const k8s = createFakeClientsResult({
      apps: {
        readNamespacedDeployment: async () => { throw new FakeApiError(404); },
        createNamespacedDeployment: async (req: { body: V1Deployment }) => {
          created.push(req.body);
          return { ...req.body, metadata: { ...req.body.metadata, uid: "uid-1" } };
        },
      } as never,
      core: {
        createNamespacedService: async () => ({}),
        listNamespacedLimitRange: async () => ({ items: [] }),
        listNamespacedResourceQuota: async () => ({
          items: [{ status: { hard: { "limits.memory": "6Gi" }, used: quotaUsed } }],
        }),
      } as never,
      networking: { listNamespacedIngress: async () => ({ items: [] }) } as never,
    });
    return { app: await buildApp(testConfig(), { logger: false, k8s }), created };
  }

  it("creates the Deployment with the requested resources", async () => {
    const { app, created } = await buildCreate();
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80, resources: { limits: { memory: "1Gi" } } },
    });
    assert.equal(res.statusCode, 201);
    const resources = created[0]?.spec?.template?.spec?.containers?.[0]?.resources;
    assert.equal(resources?.limits?.memory, "1Gi");
    assert.equal(resources?.requests?.cpu, "50m");
    await app.close();
  });

  it("returns 403 before creating anything when the quota is full", async () => {
    const { app, created } = await buildCreate({ "limits.memory": "5800Mi" });
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "hello", image: "nginx:1.27", port: 80, resources: { limits: { memory: "1Gi" } } },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(created.length, 0);
    await app.close();
  });
});
