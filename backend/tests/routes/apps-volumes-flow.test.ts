import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundPvc, volumeDeployment } from "../helpers/fake-volume-cluster.js";
import { authHeader } from "../helpers/test-config.js";
import { volumeTestApp } from "../helpers/volume-app.js";

const web = { name: "web", image: "nginx:1.27", port: 80 };

describe("app routes with volumes", () => {
  it("POST /apps creates the volume (201), 409s on a volume in use and 404s on a missing one without size", async () => {
    const { app, cluster } = await volumeTestApp();
    const created = await app.inject({ method: "POST", url: "/api/apps", headers: authHeader, payload: { ...web, volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] } });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.json().volumes, [{ name: "web-data", mountPath: "/data" }]);
    const inUse = await app.inject({ method: "POST", url: "/api/apps", headers: authHeader, payload: { ...web, name: "web2", volumes: [{ name: "web-data", mountPath: "/data" }] } });
    assert.equal(inUse.statusCode, 409);
    const missing = await app.inject({ method: "POST", url: "/api/apps", headers: authHeader, payload: { ...web, name: "web3", volumes: [{ name: "ghost", mountPath: "/data" }] } });
    assert.equal(missing.statusCode, 404);
    assert.equal(cluster.deployments.has("web3"), false);
    await app.close();
  });

  it("POST /apps with volumes and replicas 2 is a 400 that creates nothing", async () => {
    const { app, cluster } = await volumeTestApp();
    const res = await app.inject({ method: "POST", url: "/api/apps", headers: authHeader, payload: { ...web, replicas: 2, volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] } });
    assert.equal(res.statusCode, 400);
    assert.equal(cluster.pvcs.size, 0);
    await app.close();
  });

  it("PATCH replicas and PATCH scale above 1 are 400 on a volume app", async () => {
    const { app, cluster } = await volumeTestApp();
    cluster.deployments.set("web", volumeDeployment("web", [{ claim: "data", mountPath: "/data" }]));
    cluster.pvcs.set("data", boundPvc("data", "web"));
    const patch = await app.inject({ method: "PATCH", url: "/api/apps/web", headers: authHeader, payload: { replicas: 3 } });
    assert.equal(patch.statusCode, 400);
    const scale = await app.inject({ method: "PATCH", url: "/api/apps/web/scale", headers: authHeader, payload: { replicas: 2 } });
    assert.equal(scale.statusCode, 400);
    await app.close();
  });

  it("DELETE keeps volumes by default (204) and deletes them with ?deleteVolumes=true (200)", async () => {
    const keep = await volumeTestApp();
    keep.cluster.deployments.set("web", volumeDeployment("web", [{ claim: "data", mountPath: "/data" }]));
    keep.cluster.pvcs.set("data", boundPvc("data", "web"));
    const kept = await keep.app.inject({ method: "DELETE", url: "/api/apps/web", headers: authHeader });
    assert.equal(kept.statusCode, 204);
    assert.ok(keep.cluster.pvcs.has("data"));
    await keep.app.close();

    const drop = await volumeTestApp();
    drop.cluster.deployments.set("web", volumeDeployment("web", [{ claim: "data", mountPath: "/data" }]));
    drop.cluster.pvcs.set("data", boundPvc("data", "web"));
    drop.cluster.pvs.set("pv-data", { metadata: { name: "pv-data" }, spec: { persistentVolumeReclaimPolicy: "Retain" } });
    const dropped = await drop.app.inject({ method: "DELETE", url: "/api/apps/web?deleteVolumes=true", headers: authHeader });
    assert.equal(dropped.statusCode, 200);
    assert.deepEqual(dropped.json(), { ok: true, dataRetained: false, volumeErrors: [] });
    assert.equal(drop.cluster.pvcs.has("data"), false);
    await drop.app.close();
  });
});
