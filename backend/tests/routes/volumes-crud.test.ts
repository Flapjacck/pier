import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundPvc, volumeDeployment } from "../helpers/fake-volume-cluster.js";
import { authHeader } from "../helpers/test-config.js";
import { volumeTestApp } from "../helpers/volume-app.js";

const post = (payload: object) => ({ method: "POST" as const, url: "/api/volumes", headers: authHeader, payload });

describe("POST /api/volumes", () => {
  it("creates a volume (201) and rejects a duplicate (409)", async () => {
    const { app, cluster } = await volumeTestApp();
    const created = await app.inject(post({ name: "data", size: "1Gi" }));
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().name, "data");
    assert.equal(created.json().size, "1Gi");
    assert.ok(cluster.pvcs.has("data"));
    assert.equal((await app.inject(post({ name: "data", size: "1Gi" }))).statusCode, 409);
    await app.close();
  });

  it("rejects bad names and sizes with 400", async () => {
    const { app, cluster } = await volumeTestApp();
    for (const size of ["99Mi", "11Gi", "1.5Gi", "lots"]) {
      assert.equal((await app.inject(post({ name: "data", size }))).statusCode, 400, size);
    }
    assert.equal((await app.inject(post({ name: "Bad_Name", size: "1Gi" }))).statusCode, 400);
    assert.equal(cluster.pvcs.size, 0);
    await app.close();
  });

  it("maps quota to 403 and a missing StorageClass to 503 with a hint", async () => {
    const quota = await volumeTestApp({ quotaFailPvcs: ["data"] });
    const q = await quota.app.inject(post({ name: "data", size: "1Gi" }));
    assert.equal(q.statusCode, 403);
    assert.equal(q.json().error, "quota exceeded");
    await quota.app.close();
    const noSc = await volumeTestApp({ noStorageClass: true });
    const s = await noSc.app.inject(post({ name: "data", size: "1Gi" }));
    assert.equal(s.statusCode, 503);
    assert.match(s.json().details, /deploy-local\.sh/);
    await noSc.app.close();
  });
});

describe("GET and DELETE /api/volumes/:name", () => {
  it("lists volumes with their attached app", async () => {
    const { app, cluster } = await volumeTestApp();
    cluster.deployments.set("web", volumeDeployment("web", [{ claim: "data", mountPath: "/data" }]));
    cluster.pvcs.set("data", boundPvc("data", "web"));
    const list = await app.inject({ method: "GET", url: "/api/volumes", headers: authHeader });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json().map((v: { name: string; app?: string; mountPath?: string; status: string }) => [v.name, v.app, v.mountPath, v.status]), [["data", "web", "/data", "bound"]]);
    const one = await app.inject({ method: "GET", url: "/api/volumes/data", headers: authHeader });
    assert.equal(one.json().app, "web");
    await app.close();
  });

  it("refuses to delete an attached volume (409), deletes a free one (200) and 404s after", async () => {
    const { app, cluster } = await volumeTestApp();
    cluster.deployments.set("web", volumeDeployment("web", [{ claim: "used", mountPath: "/data" }]));
    cluster.pvcs.set("used", boundPvc("used", "web"));
    cluster.pvcs.set("free", boundPvc("free"));
    cluster.pvs.set("pv-free", { metadata: { name: "pv-free" }, spec: { persistentVolumeReclaimPolicy: "Retain" } });
    const del = (name: string) => app.inject({ method: "DELETE", url: `/api/volumes/${name}`, headers: authHeader });
    assert.equal((await del("used")).statusCode, 409);
    const ok = await del("free");
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json(), { ok: true, dataRetained: false });
    assert.equal(cluster.pvs.has("pv-free"), false);
    assert.equal((await del("free")).statusCode, 404);
    assert.equal((await del("Bad_Name")).statusCode, 400);
    await app.close();
  });

  it("requires a token", async () => {
    const { app } = await volumeTestApp();
    assert.equal((await app.inject({ method: "POST", url: "/api/volumes", payload: { name: "d", size: "1Gi" } })).statusCode, 401);
    assert.equal((await app.inject({ method: "DELETE", url: "/api/volumes/d" })).statusCode, 401);
    await app.close();
  });
});
