import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { getAppSource } from "../../src/db/app-sources.js";
import { listAudit } from "../../src/db/audit.js";
import { getDeployment } from "../../src/db/deployments-read.js";
import { openDatabase } from "../../src/db/open.js";
import { fakeBuilds, liveDeployment, sourceCluster, sourceK8s, type SourceCluster } from "../helpers/source-cluster.js";
import { authHeader, testConfig } from "../helpers/test-config.js";
import { waitFor } from "../helpers/wait-for.js";

/** Build-from-repo apps through the HTTP API (#83). */

async function setup(cluster: SourceCluster = sourceCluster()) {
  const db = openDatabase(":memory:");
  const builds = fakeBuilds();
  const app = await buildApp(testConfig(), { logger: false, k8s: sourceK8s(cluster), db, deployPollMs: 60_000, runBuild: builds.runBuild, volumeHints: async () => [] });
  return { app, db, builds, cluster };
}

const req = (method: "GET" | "POST" | "DELETE", url: string, payload?: Record<string, unknown>) =>
  payload ? { method, url, headers: authHeader, payload } : { method, url, headers: authHeader };
const body = { name: "web", port: 3000, env: { SECRET: "hunter2" }, source: { repo: "https://github.com/acme/web" } };
const steps = (db: DatabaseSync, id: number) => Object.fromEntries((getDeployment(db, id)?.steps ?? []).map((s) => [s.name, s.status]));

describe("POST /api/apps with a git source (#83)", () => {
  it("answers 201 building at once, then creates the app after the build and forgets env", async () => {
    const { app, db, builds, cluster } = await setup();
    const res = await app.inject(req("POST", "/api/apps", body));
    assert.equal(res.statusCode, 201);
    const created = res.json();
    assert.equal(created.status, "building");
    assert.equal(created.source.repo, "https://github.com/acme/web");
    assert.equal(created.source.method, "railpack");
    assert.equal(res.body.includes("hunter2"), false);
    const id = created.deploymentId as number;

    // The app has a page while it builds.
    assert.equal((await app.inject(req("GET", "/api/apps/web"))).json().status, "building");
    assert.deepEqual((await app.inject(req("GET", "/api/apps"))).json().map((a: { name: string }) => a.name), ["web"]);

    await waitFor(() => builds.pending.length === 1, 2000, "build start");
    builds.finish();
    await waitFor(() => steps(db, id).apply === "succeeded", 2000, "apply");
    assert.equal(steps(db, id).build, "succeeded");
    assert.equal(cluster.creates[0]?.spec?.template.spec?.containers[0]?.image, `localhost:30500/web:d${id}`);
    const row = getAppSource(db, "web");
    assert.equal(row?.pendingCreate, null, "env values leave SQLite once they live in the Deployment");
    assert.equal(row?.lastCommit, "0123456789abcdef");
    const spec = getDeployment(db, id)?.spec;
    assert.equal(spec?.source?.commit, "0123456789abcdef");
    assert.equal(JSON.stringify(spec).includes("hunter2"), false);

    const one = (await app.inject(req("GET", "/api/apps/web"))).json();
    assert.equal(one.source.repo, "https://github.com/acme/web");
    assert.equal(one.source.lastCommit, "0123456789abcdef");
    const [audit] = listAudit(db, { limit: 10 }).entries.filter((a) => a.action === "app.create");
    assert.equal(audit?.details?.repo, "https://github.com/acme/web");
    assert.equal(JSON.stringify(audit).includes("hunter2"), false);
    await app.close();
  });

  it("a failed build leaves a failed app with a page and its deploy record", async () => {
    const { app, db, builds, cluster } = await setup();
    const id = (await app.inject(req("POST", "/api/apps", body))).json().deploymentId as number;
    await waitFor(() => builds.pending.length === 1, 2000, "build start");
    builds.finish({ ok: false, reason: "The image build failed (exit code 1)." });
    await waitFor(() => getDeployment(db, id)?.status === "failed", 2000, "fail");
    assert.equal(steps(db, id).build, "failed");
    assert.equal(cluster.creates.length, 0);
    const page = await app.inject(req("GET", "/api/apps/web"));
    assert.equal(page.statusCode, 200);
    assert.equal(page.json().status, "failed");
    assert.equal(page.json().deploymentId, id);
    await app.close();
  });

  it("rejects bad requests before saving anything", async () => {
    const { app, db } = await setup(sourceCluster({ live: undefined }));
    assert.equal((await app.inject(req("POST", "/api/apps", { ...body, image: "nginx" }))).statusCode, 400);
    assert.equal((await app.inject(req("POST", "/api/apps", { name: "web", port: 3000 }))).statusCode, 400);
    assert.equal((await app.inject(req("POST", "/api/apps", { ...body, source: { repo: "http://github.com/acme/web" } }))).statusCode, 400);
    const cred = await app.inject(req("POST", "/api/apps", { ...body, source: { repo: body.source.repo, gitCredential: "gone" } }));
    assert.equal(cred.statusCode, 404);
    assert.equal(getAppSource(db, "web"), undefined);
    await app.close();

    const taken = await setup(sourceCluster({ live: liveDeployment("nginx") }));
    assert.equal((await taken.app.inject(req("POST", "/api/apps", body))).statusCode, 409);
    await taken.app.close();
  });

  it("a second create for a building name is a 409, and an image create can't take it either", async () => {
    const { app } = await setup();
    assert.equal((await app.inject(req("POST", "/api/apps", body))).statusCode, 201);
    assert.equal((await app.inject(req("POST", "/api/apps", body))).statusCode, 409);
    assert.equal((await app.inject(req("POST", "/api/apps", { name: "web", image: "nginx", port: 80 }))).statusCode, 409);
    await app.close();
  });
});

describe("Redeploy and delete for git apps (#83)", () => {
  it("redeploy rebuilds and swaps the image; a second one while building is 409", async () => {
    const { app, db, builds, cluster } = await setup();
    const first = (await app.inject(req("POST", "/api/apps", body))).json().deploymentId as number;
    await waitFor(() => builds.pending.length === 1, 2000, "build");
    builds.finish();
    await waitFor(() => steps(db, first).apply === "succeeded", 2000, "first apply");

    const res = await app.inject(req("POST", "/api/apps/web/redeploy"));
    assert.equal(res.statusCode, 202);
    const id = res.json().deploymentId as number;
    assert.equal(getDeployment(db, id)?.trigger, "build");
    assert.equal((await app.inject(req("POST", "/api/apps/web/redeploy"))).statusCode, 409);
    await waitFor(() => builds.pending.length === 1, 2000, "rebuild");
    builds.finish();
    await waitFor(() => steps(db, id).apply === "succeeded", 2000, "redeploy apply");
    assert.equal(cluster.creates.length, 1, "redeploy patches, never re-creates");
    assert.equal(cluster.live?.spec?.template.spec?.containers[0]?.image, `localhost:30500/web:d${id}`);
    assert.ok(listAudit(db, { limit: 10 }).entries.some((a) => a.action === "app.redeploy" && a.app === "web"));
    await app.close();
  });

  it("redeploy after a failed first build retries the create; 409 without a source, 404 unknown", async () => {
    const { app, db, builds, cluster } = await setup();
    await app.inject(req("POST", "/api/apps", body));
    await waitFor(() => builds.pending.length === 1, 2000, "build");
    builds.finish({ ok: false, reason: "boom" });
    await waitFor(() => getDeployment(db, 1)?.status === "failed", 2000, "fail");
    const retry = await app.inject(req("POST", "/api/apps/web/redeploy"));
    assert.equal(retry.statusCode, 202);
    assert.equal(getDeployment(db, retry.json().deploymentId)?.trigger, "create");
    await waitFor(() => builds.pending.length === 1, 2000, "retry build");
    builds.finish();
    await waitFor(() => cluster.creates.length === 1, 2000, "create");
    assert.equal((await app.inject(req("POST", "/api/apps/nope/redeploy"))).statusCode, 404);
    await app.close();

    const imageApp = await setup(sourceCluster({ live: liveDeployment("nginx") }));
    assert.equal((await imageApp.app.inject(req("POST", "/api/apps/web/redeploy"))).statusCode, 409);
    await imageApp.app.close();
  });

  it("deleting a building app cancels the build and doesn't create it afterwards", async () => {
    const { app, db, builds, cluster } = await setup();
    const id = (await app.inject(req("POST", "/api/apps", body))).json().deploymentId as number;
    await waitFor(() => builds.pending.length === 1, 2000, "build");
    const del = await app.inject(req("DELETE", "/api/apps/web"));
    assert.equal(del.statusCode, 204);
    assert.equal(getAppSource(db, "web"), undefined);
    builds.finish();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(cluster.creates.length, 0);
    assert.notEqual(getDeployment(db, id)?.status, "running");
    assert.equal((await app.inject(req("GET", "/api/apps/web"))).statusCode, 404);
    await app.close();
  });
});
