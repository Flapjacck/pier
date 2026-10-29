import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { clusterRoutesWithDeps } from "../../src/routes/cluster.js";

describe("GET /cluster/health", () => {
  it("returns 200 when the cluster check passes", async () => {
    const app = Fastify({ logger: false });
    await app.register(
      clusterRoutesWithDeps({
        loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
        getClusterHealth: async () => ({
          ok: true,
          mode: "kubeconfig",
          version: "v1.30.0+k3s1",
          nodes: { total: 1, ready: 1 },
        }),
        listClusterPods: async () => ({ ok: true, mode: "kubeconfig", pods: [], total: 0 }),
      }),
    );

    const res = await app.inject({ method: "GET", url: "/cluster/health" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; version: string };
    assert.equal(body.ok, true);
    assert.equal(body.version, "v1.30.0+k3s1");
    await app.close();
  });

  it("returns 503 with generic error when the cluster check fails", async () => {
    const app = Fastify({ logger: false });
    await app.register(
      clusterRoutesWithDeps({
        loadKubeConfig: () => ({ kc: {} as never, mode: "in-cluster" }),
        getClusterHealth: async () => {
          // Simulate an error from the Kubernetes API.
          throw new Error("Forbidden: cannot access /version");
        },
        listClusterPods: async () => ({ ok: true, mode: "in-cluster", pods: [], total: 0 }),
      }),
    );

    const res = await app.inject({ method: "GET", url: "/cluster/health" });
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
  it("returns 200 with pod list on success", async () => {
    const app = Fastify({ logger: false });
    await app.register(
      clusterRoutesWithDeps({
        loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
        getClusterHealth: async () => ({ ok: true, mode: "kubeconfig", nodes: { total: 1, ready: 1 } }),
        listClusterPods: async () => ({
          ok: true,
          mode: "kubeconfig",
          total: 1,
          pods: [
            {
              name: "demo",
              namespace: "default",
              phase: "Running",
              ready: "1/1",
            },
          ],
        }),
      }),
    );

    const res = await app.inject({ method: "GET", url: "/cluster/pods" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; total: number };
    assert.equal(body.ok, true);
    assert.equal(body.total, 1);
    await app.close();
  });

  it("returns 503 with generic error when Kubernetes call fails", async () => {
    const app = Fastify({ logger: false });
    await app.register(
      clusterRoutesWithDeps({
        loadKubeConfig: () => ({ kc: {} as never, mode: "in-cluster" }),
        getClusterHealth: async () => ({ ok: true, mode: "in-cluster", nodes: { total: 1, ready: 1 } }),
        listClusterPods: async () => {
          // Simulate an error from the Kubernetes API.
          throw new Error("Forbidden: cannot list pods");
        },
      }),
    );

    const res = await app.inject({ method: "GET", url: "/cluster/pods" });
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
