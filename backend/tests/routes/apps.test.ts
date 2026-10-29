import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import type { AppsV1Api } from "@kubernetes/client-node";
import { setupAuth } from "../../src/plugins/auth.js";
import { appsRoutesWithDeps } from "../../src/routes/apps.js";

const testToken = "test-token-secret";
const sampleApps = [
  {
    name: "hello",
    image: "nginx:1.27",
    replicas: 1,
    ready: 1,
    status: "running" as const,
    createdAt: "2026-10-29T15:00:00.000Z",
  },
];

function registerAppsRoute(
  app: ReturnType<typeof Fastify>,
  listApps: (
    _api: AppsV1Api,
    namespace: string,
  ) => Promise<typeof sampleApps>,
  namespace = "pier-apps",
) {
  return app.register(
    appsRoutesWithDeps({
      namespace,
      loadKubeConfig: () => ({ kc: { makeApiClient: () => ({}) } as never, mode: "kubeconfig" }),
      listApps,
    }),
  );
}

describe("GET /apps", () => {
  it("returns 401 without a bearer token when auth is configured", async () => {
    const app = Fastify({ logger: false });
    setupAuth(app, testToken);
    await registerAppsRoute(app, async () => sampleApps);

    const res = await app.inject({ method: "GET", url: "/apps" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns the app list with a valid token", async () => {
    const app = Fastify({ logger: false });
    setupAuth(app, testToken);
    await registerAppsRoute(app, async () => sampleApps);

    const res = await app.inject({
      method: "GET",
      url: "/apps",
      headers: { authorization: `Bearer ${testToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as typeof sampleApps;
    assert.equal(body.length, 1);
    assert.equal(body[0]?.name, "hello");
    await app.close();
  });

  it("returns an empty array when there are no apps", async () => {
    const app = Fastify({ logger: false });
    setupAuth(app, testToken);
    await registerAppsRoute(app, async () => []);

    const res = await app.inject({
      method: "GET",
      url: "/apps",
      headers: { authorization: `Bearer ${testToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
    await app.close();
  });

  it("returns 503 with a generic body when listApps throws", async () => {
    const app = Fastify({ logger: false });
    setupAuth(app, testToken);
    await registerAppsRoute(app, async () => {
      throw new Error("Forbidden: cannot list deployments");
    });

    const res = await app.inject({
      method: "GET",
      url: "/apps",
      headers: { authorization: `Bearer ${testToken}` },
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "cluster unreachable");
    assert(!res.body.includes("Forbidden"));
    await app.close();
  });

  it("passes the configured namespace to listApps", async () => {
    const app = Fastify({ logger: false });
    setupAuth(app, testToken);
    let seenNamespace: string | undefined;
    await registerAppsRoute(
      app,
      async (_api, namespace) => {
        seenNamespace = namespace;
        return [];
      },
      "custom-ns",
    );

    await app.inject({
      method: "GET",
      url: "/apps",
      headers: { authorization: `Bearer ${testToken}` },
    });
    assert.equal(seenNamespace, "custom-ns");
    await app.close();
  });
});
