import assert from "node:assert/strict";
import type { CoreV1Api, V1Secret } from "@kubernetes/client-node";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { upsertAppSource } from "../../src/db/app-sources.js";
import { openDatabase } from "../../src/db/open.js";
import { gitCredentialsRoutesWithDeps } from "../../src/routes/git-credentials.js";
import { createFailedClientsResult, createFakeClientsResult, FakeApiError } from "../helpers/fake-clients.js";

type Call = { name?: string; namespace: string; body?: V1Secret; labelSelector?: string };

/** In-memory Secrets keyed by name; refuse makes every call throw that status. */
function fakeCore(refuse?: number) {
  const secrets = new Map<string, V1Secret>();
  const guard = () => {
    if (refuse) throw new FakeApiError(refuse);
  };
  const core = {
    createNamespacedSecret: async ({ body }: Call) => {
      guard();
      const name = body?.metadata?.name ?? "";
      if (secrets.has(name)) throw new FakeApiError(409);
      secrets.set(name, { ...body, metadata: { ...body?.metadata, creationTimestamp: new Date("2026-11-10T00:00:00Z") } });
      return body;
    },
    readNamespacedSecret: async ({ name }: Call) => {
      guard();
      const found = secrets.get(name ?? "");
      if (!found) throw new FakeApiError(404);
      return found;
    },
    patchNamespacedSecret: async ({ name, body }: Call) => {
      guard();
      const current = secrets.get(name ?? "");
      if (!current) throw new FakeApiError(404);
      secrets.set(name ?? "", { ...current, data: body?.data });
      return body;
    },
    listNamespacedSecret: async () => {
      guard();
      return { items: [...secrets.values()] };
    },
    deleteNamespacedSecret: async ({ name }: Call) => {
      guard();
      secrets.delete(name ?? "");
      return {};
    },
  };
  return { secrets, core: core as unknown as CoreV1Api };
}

async function setup(opts: { refuse?: number; offline?: boolean } = {}) {
  const db = openDatabase(":memory:");
  const fake = fakeCore(opts.refuse);
  const app = Fastify();
  const k8s = opts.offline ? createFailedClientsResult() : createFakeClientsResult({ core: fake.core });
  await app.register(gitCredentialsRoutesWithDeps({ k8s, namespace: "pier-system", db }), { prefix: "/api" });
  return { app, db, ...fake };
}

const body = { name: "github", username: "octocat", token: "ghp_secret" };

describe("git credentials routes (#83)", () => {
  it("creates a write-only Secret and never returns the token", async () => {
    const { app, secrets } = await setup();
    const created = await app.inject({ method: "POST", url: "/api/git-credentials", payload: body });
    assert.equal(created.statusCode, 201);
    assert.ok(!created.body.includes("ghp_secret"));
    const secret = secrets.get("pier-git-github");
    assert.equal(Buffer.from(secret?.data?.token ?? "", "base64").toString(), "ghp_secret");
    assert.equal(secret?.metadata?.labels?.["pier.git-credential"], "github");
    const list = await app.inject({ method: "GET", url: "/api/git-credentials" });
    assert.deepEqual(list.json().credentials.map((c: { name: string; username: string }) => [c.name, c.username]), [["github", "octocat"]]);
    assert.ok(!list.body.includes("ghp_secret"));
    assert.equal((await app.inject({ method: "POST", url: "/api/git-credentials", payload: body })).statusCode, 409);
  });

  it("updates the token or username and 404s unknown names", async () => {
    const { app, secrets } = await setup();
    await app.inject({ method: "POST", url: "/api/git-credentials", payload: body });
    const res = await app.inject({ method: "PATCH", url: "/api/git-credentials/github", payload: { token: "ghp_new" } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().credential.username, "octocat");
    assert.equal(Buffer.from(secrets.get("pier-git-github")?.data?.token ?? "", "base64").toString(), "ghp_new");
    assert.equal((await app.inject({ method: "PATCH", url: "/api/git-credentials/nope", payload: { token: "x" } })).statusCode, 404);
  });

  it("refuses to delete a credential a build source uses", async () => {
    const { app, db, secrets } = await setup();
    await app.inject({ method: "POST", url: "/api/git-credentials", payload: body });
    upsertAppSource(db, { app: "api", method: "railpack", repo: "https://github.com/acme/api", branch: "main", folder: "", dockerfile: "Dockerfile", gitCredential: "github", updatedAt: 1 });
    const blocked = await app.inject({ method: "DELETE", url: "/api/git-credentials/github" });
    assert.equal(blocked.statusCode, 409);
    assert.deepEqual(blocked.json().apps, ["api"]);
    db.prepare("DELETE FROM app_sources").run();
    assert.equal((await app.inject({ method: "DELETE", url: "/api/git-credentials/github" })).statusCode, 204);
    assert.equal(secrets.size, 0);
    assert.equal((await app.inject({ method: "DELETE", url: "/api/git-credentials/github" })).statusCode, 404);
  });

  it("validates names and bodies", async () => {
    const { app } = await setup();
    assert.equal((await app.inject({ method: "POST", url: "/api/git-credentials", payload: { ...body, name: "Bad_Name" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/git-credentials", payload: { name: "x", username: "u" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "PATCH", url: "/api/git-credentials/github", payload: {} })).statusCode, 400);
  });

  it("explains missing RBAC or namespace as 502 and an offline cluster as 503", async () => {
    const forbidden = await (await setup({ refuse: 403 })).app.inject({ method: "GET", url: "/api/git-credentials" });
    assert.equal(forbidden.statusCode, 502);
    assert.match(forbidden.json().error, /rbac-builds\.yaml/);
    const missing = await (await setup({ refuse: 404 })).app.inject({ method: "POST", url: "/api/git-credentials", payload: body });
    assert.equal(missing.statusCode, 502);
    assert.match(missing.json().error, /namespace-system\.yaml/);
    const offline = await (await setup({ offline: true })).app.inject({ method: "GET", url: "/api/git-credentials" });
    assert.equal(offline.statusCode, 503);
  });

  it("a bug (unexpected error) is a 500, not cluster unreachable", async () => {
    const { app } = await setup({ refuse: 500 });
    assert.equal((await app.inject({ method: "GET", url: "/api/git-credentials" })).statusCode, 500);
  });
});
