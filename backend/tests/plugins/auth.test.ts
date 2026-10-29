import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { setupAuth } from "../../src/plugins/auth.js";
import { clusterRoutesWithDeps } from "../../src/routes/cluster.js";

describe("setupAuth", () => {
  describe("with apiToken configured", () => {
    const testToken = "test-token-secret";

    it("rejects requests without Authorization header", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);
      await app.register(
        clusterRoutesWithDeps({
          loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
          getClusterHealth: async () => ({
            ok: true,
            mode: "kubeconfig",
            version: "v1.0.0",
          }),
          listClusterPods: async () => ({ ok: true, mode: "kubeconfig", pods: [], total: 0 }),
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/cluster/pods",
      });
      assert.equal(res.statusCode, 401);
      const body = res.json() as { ok: boolean; error: string };
      assert.deepEqual(body, { ok: false, error: "unauthorized" });
      await app.close();
    });

    it("rejects requests with wrong bearer token", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);
      await app.register(
        clusterRoutesWithDeps({
          loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
          getClusterHealth: async () => ({
            ok: true,
            mode: "kubeconfig",
            version: "v1.0.0",
          }),
          listClusterPods: async () => ({ ok: true, mode: "kubeconfig", pods: [], total: 0 }),
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/cluster/pods",
        headers: {
          authorization: "Bearer wrong-token",
        },
      });
      assert.equal(res.statusCode, 401);
      const body = res.json() as { ok: boolean; error: string };
      assert.deepEqual(body, { ok: false, error: "unauthorized" });
      await app.close();
    });

    it("rejects requests with Basic auth scheme", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);
      await app.register(
        clusterRoutesWithDeps({
          loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
          getClusterHealth: async () => ({
            ok: true,
            mode: "kubeconfig",
            version: "v1.0.0",
          }),
          listClusterPods: async () => ({ ok: true, mode: "kubeconfig", pods: [], total: 0 }),
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/cluster/pods",
        headers: {
          authorization: "Basic dXNlcjpwYXNz",
        },
      });
      assert.equal(res.statusCode, 401);
      const body = res.json() as { ok: boolean; error: string };
      assert.deepEqual(body, { ok: false, error: "unauthorized" });
      await app.close();
    });

    it("rejects malformed authorization header", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);
      await app.register(
        clusterRoutesWithDeps({
          loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
          getClusterHealth: async () => ({
            ok: true,
            mode: "kubeconfig",
            version: "v1.0.0",
          }),
          listClusterPods: async () => ({ ok: true, mode: "kubeconfig", pods: [], total: 0 }),
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/cluster/pods",
        headers: {
          authorization: "NotBearerToken",
        },
      });
      assert.equal(res.statusCode, 401);
      const body = res.json() as { ok: boolean; error: string };
      assert.deepEqual(body, { ok: false, error: "unauthorized" });
      await app.close();
    });

    it("accepts correct bearer token on /cluster/health", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);
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

      const res = await app.inject({
        method: "GET",
        url: "/cluster/health",
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; version: string };
      assert.equal(body.ok, true);
      assert.equal(body.version, "v1.30.0+k3s1");
      await app.close();
    });

    it("accepts correct bearer token on /cluster/pods", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);
      await app.register(
        clusterRoutesWithDeps({
          loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
          getClusterHealth: async () => ({
            ok: true,
            mode: "kubeconfig",
            version: "v1.30.0+k3s1",
            nodes: { total: 1, ready: 1 },
          }),
          listClusterPods: async () => ({
            ok: true,
            mode: "kubeconfig",
            pods: [
              {
                name: "demo",
                namespace: "default",
                phase: "Running",
                ready: "1/1",
              },
            ],
            total: 1,
          }),
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/cluster/pods",
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; total: number };
      assert.equal(body.ok, true);
      assert.equal(body.total, 1);
      await app.close();
    });

    it("allows /health without authorization", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, testToken);

      app.get("/health", async () => ({
        ok: true,
        service: "pier-backend",
      }));

      const res = await app.inject({
        method: "GET",
        url: "/health",
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; service: string };
      assert.equal(body.ok, true);
      assert.equal(body.service, "pier-backend");
      await app.close();
    });
  });

  describe("without apiToken (dev mode on loopback)", () => {
    it("allows /cluster/health without token", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, undefined);
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

      const res = await app.inject({
        method: "GET",
        url: "/cluster/health",
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; version: string };
      assert.equal(body.ok, true);
      assert.equal(body.version, "v1.30.0+k3s1");
      await app.close();
    });

    it("allows /cluster/pods without token", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, undefined);
      await app.register(
        clusterRoutesWithDeps({
          loadKubeConfig: () => ({ kc: {} as never, mode: "kubeconfig" }),
          getClusterHealth: async () => ({
            ok: true,
            mode: "kubeconfig",
            version: "v1.30.0+k3s1",
            nodes: { total: 1, ready: 1 },
          }),
          listClusterPods: async () => ({
            ok: true,
            mode: "kubeconfig",
            pods: [
              {
                name: "demo",
                namespace: "default",
                phase: "Running",
                ready: "1/1",
              },
            ],
            total: 1,
          }),
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/cluster/pods",
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; total: number };
      assert.equal(body.ok, true);
      assert.equal(body.total, 1);
      await app.close();
    });

    it("allows /health without token", async () => {
      const app = Fastify({ logger: false });
      setupAuth(app, undefined);

      app.get("/health", async () => ({
        ok: true,
        service: "pier-backend",
      }));

      const res = await app.inject({
        method: "GET",
        url: "/health",
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; service: string };
      assert.equal(body.ok, true);
      assert.equal(body.service, "pier-backend");
      await app.close();
    });
  });
});
