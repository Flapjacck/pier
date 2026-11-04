import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import type { V1Deployment } from "@kubernetes/client-node";
import { buildApp } from "../../src/app.js";
import { getDeployment, listDeployments } from "../../src/db/deployments-read.js";
import { openDatabase } from "../../src/db/open.js";
import { createFakeClientsResult, FakeApiError } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

/** Requests that change an app record a deploy (#81). */

function live(): V1Deployment {
  return {
    metadata: { name: "hello", uid: "dep-1", labels: { "pier.app": "hello" }, generation: 2, creationTimestamp: new Date("2026-11-02T15:00:00Z") },
    spec: {
      replicas: 1,
      selector: { matchLabels: { "pier.app": "hello" } },
      template: {
        spec: { containers: [{ name: "app", image: "nginx:1.27", ports: [{ name: "http", containerPort: 8080 }], env: [{ name: "SECRET", value: "hunter2" }] }] },
      },
    },
    status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
  };
}

type Cluster = { exists: boolean; createError?: unknown; quotaFull?: boolean };

function fakeK8s(cluster: Cluster) {
  const notFound = async () => {
    throw new FakeApiError(404);
  };
  return createFakeClientsResult({
    apps: {
      readNamespacedDeployment: async () => (cluster.exists ? live() : notFound()),
      createNamespacedDeployment: async () => {
        if (cluster.createError) throw cluster.createError;
        cluster.exists = true;
        return live();
      },
      patchNamespacedDeployment: async () => live(),
      deleteNamespacedDeployment: async () => {
        cluster.exists = false;
        return {};
      },
      listNamespacedReplicaSet: async () => ({ items: [] }),
    } as never,
    core: {
      createNamespacedService: async () => ({}),
      deleteNamespacedService: async () => ({}),
      patchNamespacedService: async () => ({}),
      listNamespacedPod: async () => ({ items: [] }),
      listNamespacedEvent: async () => ({ items: [] }),
      listNamespacedLimitRange: async () => ({ items: [] }),
      listNamespacedResourceQuota: async () => ({
        items: cluster.quotaFull ? [{ metadata: { name: "pier-apps-quota" }, status: { hard: { "requests.cpu": "1" }, used: { "requests.cpu": "1" } } }] : [],
      }),
    } as never,
    networking: {
      listNamespacedIngress: async () => ({ items: [] }),
      readNamespacedIngress: notFound,
      deleteNamespacedIngress: notFound,
    } as never,
  });
}

async function setup(cluster: Cluster = { exists: false }) {
  const db = openDatabase(":memory:");
  const app = await buildApp(testConfig(), { logger: false, k8s: fakeK8s(cluster), db, deployPollMs: 60_000 });
  return { app, db };
}

function send(method: "POST" | "PATCH", url: string, payload?: Record<string, unknown>) {
  return payload ? { method, url, headers: authHeader, payload } : { method, url, headers: authHeader };
}

function steps(db: DatabaseSync, id: number): Record<string, string> {
  return Object.fromEntries((getDeployment(db, id)?.steps ?? []).map((s) => [s.name, s.status]));
}

const body = { name: "hello", image: "nginx:1.27", port: 8080, env: { SECRET: "hunter2" } };

describe("deploy records from app routes", () => {
  it("POST /apps returns deploymentId with Validate and Apply done and a spec without env values", async () => {
    const { app, db } = await setup();
    const res = await app.inject(send("POST", "/api/apps", body));
    assert.equal(res.statusCode, 201);
    const id = res.json().deploymentId as number;
    assert.ok(Number.isInteger(id));
    const row = getDeployment(db, id);
    assert.equal(row?.trigger, "create");
    assert.equal(steps(db, id).validate, "succeeded");
    assert.equal(steps(db, id).apply, "succeeded");
    assert.deepEqual(row?.spec.envKeys, ["SECRET"]);
    assert.equal(JSON.stringify(row?.spec).includes("hunter2"), false);
    await app.close();
  });

  it("records a failed Validate for rejected resources and a failed Apply for a cluster rejection", async () => {
    const { app, db } = await setup();
    const bad = await app.inject(send("POST", "/api/apps", { ...body, resources: { requests: { cpu: "2" }, limits: { cpu: "1" } } }));
    assert.equal(bad.statusCode, 400);
    const [first] = listDeployments(db, { app: "hello", limit: 5 }).items;
    assert.equal(first?.status, "failed");
    assert.equal(steps(db, first?.id ?? 0).validate, "failed");
    assert.ok(first?.reason);
    await app.close();

    const full = await setup({ exists: false, quotaFull: true });
    const over = await full.app.inject(send("POST", "/api/apps", { ...body, resources: { requests: { cpu: "500m" } } }));
    assert.equal(over.statusCode, 403);
    const [quotaRow] = listDeployments(full.db, { app: "hello", limit: 5 }).items;
    assert.equal(steps(full.db, quotaRow?.id ?? 0).validate, "failed");
    assert.equal(quotaRow?.reason, over.json().details);
    await full.app.close();

    const quota = Object.assign(new Error("forbidden"), { statusCode: 403, body: JSON.stringify({ message: "exceeded quota: pier-apps-quota" }) });
    const second = await setup({ exists: false, createError: quota });
    const res = await second.app.inject(send("POST", "/api/apps", body));
    assert.equal(res.statusCode, 403);
    const [row] = listDeployments(second.db, { app: "hello", limit: 5 }).items;
    assert.equal(row?.status, "failed");
    assert.equal(steps(second.db, row?.id ?? 0).validate, "succeeded");
    assert.equal(steps(second.db, row?.id ?? 0).apply, "failed");
    assert.match(row?.reason ?? "", /quota/);
    await second.app.close();
  });

  it("does not record a 409 for an existing app or a 404 PATCH/restart", async () => {
    const { app, db } = await setup({ exists: true });
    assert.equal((await app.inject(send("POST", "/api/apps", body))).statusCode, 409);
    assert.equal(listDeployments(db, { app: "hello", limit: 5 }).items.length, 0);
    await app.close();
    const gone = await setup({ exists: false });
    assert.equal((await gone.app.inject(send("PATCH", "/api/apps/hello", { replicas: 2 }))).statusCode, 404);
    assert.equal((await gone.app.inject(send("POST", "/api/apps/hello/restart"))).statusCode, 404);
    assert.equal(listDeployments(gone.db, { app: "hello", limit: 5 }).items.length, 0);
    await gone.app.close();
  });

  it("PATCH and restart return deploymentId; a newer applied deploy supersedes the older one", async () => {
    const { app, db } = await setup({ exists: true });
    const patched = await app.inject(send("PATCH", "/api/apps/hello", { image: "nginx:1.28", env: { TOKEN: "x" } }));
    assert.equal(patched.statusCode, 200);
    const patchId = patched.json().deploymentId as number;
    assert.equal(getDeployment(db, patchId)?.trigger, "patch");
    const restarted = await app.inject(send("POST", "/api/apps/hello/restart"));
    assert.equal(restarted.statusCode, 202);
    const restartId = restarted.json().deploymentId as number;
    assert.ok(restartId > patchId);
    const restart = getDeployment(db, restartId);
    assert.equal(restart?.trigger, "restart");
    assert.equal(restart?.spec.image, "nginx:1.27");
    assert.deepEqual(restart?.spec.envKeys, ["SECRET"]);
    const old = getDeployment(db, patchId);
    assert.equal(old?.status, "cancelled");
    assert.equal(old?.reason, `Superseded by deploy #${restartId}.`);
    await app.close();
  });

  it("DELETE cancels the app's running deploys", async () => {
    const { app, db } = await setup({ exists: true });
    const id = (await app.inject(send("POST", "/api/apps/hello/restart"))).json().deploymentId as number;
    const res = await app.inject({ method: "DELETE", url: "/api/apps/hello", headers: authHeader });
    assert.equal(res.statusCode, 204);
    const row = getDeployment(db, id);
    assert.equal(row?.status, "cancelled");
    assert.equal(row?.reason, "The app was deleted.");
    await app.close();
  });
});
