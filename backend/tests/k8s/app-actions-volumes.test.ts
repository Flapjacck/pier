import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteApp, scaleApp } from "../../src/k8s/app-actions.js";
import { VolumesReplicaError } from "../../src/k8s/volumes/errors.js";
import { asClients, boundPvc, fakeVolumeCluster, volumeDeployment } from "../helpers/fake-volume-cluster.js";

const NS = "pier-apps";

function setup(opts = {}) {
  const cluster = fakeVolumeCluster(opts);
  cluster.deployments.set("web", volumeDeployment("web", [{ claim: "data", mountPath: "/data" }]));
  cluster.pvcs.set("data", boundPvc("data", "web"));
  cluster.pvs.set("pv-data", { metadata: { name: "pv-data" }, spec: { persistentVolumeReclaimPolicy: "Retain" } });
  return cluster;
}

describe("deleteApp volumes", () => {
  it("keeps the PVC and removes its pier.app label by default", async () => {
    const cluster = setup();
    const result = await deleteApp(asClients(cluster), NS, "web");
    assert.ok(cluster.pvcs.has("data"));
    assert.equal(cluster.pvcs.get("data")?.metadata?.labels?.["pier.app"], undefined);
    assert.deepEqual(result.volumeErrors, []);
  });

  it("deletes the PVC and its PV with deleteVolumes even though the Deployment is still terminating", async () => {
    const cluster = setup();
    const result = await deleteApp(asClients(cluster), NS, "web", true);
    assert.equal(cluster.pvcs.has("data"), false);
    assert.equal(cluster.pvs.has("pv-data"), false);
    assert.deepEqual(result, { deleted: ["deployment", "service"], volumeErrors: [], dataRetained: false });
  });

  it("reports dataRetained when the PV reclaim flip is forbidden", async () => {
    const cluster = setup({ failPvPatch: true });
    const warnings: string[] = [];
    const result = await deleteApp(asClients(cluster), NS, "web", true, { warn: (_o, msg) => warnings.push(msg) });
    assert.equal(cluster.pvcs.has("data"), false);
    assert.equal(cluster.pvs.has("pv-data"), true);
    assert.equal(result.dataRetained, true);
    assert.equal(warnings.length, 1);
  });
});

describe("scaleApp volumes", () => {
  it("allows 0 and 1 but rejects more for apps with volumes", async () => {
    const cluster = setup();
    await scaleApp(cluster.apps as never, NS, "web", 0);
    await scaleApp(cluster.apps as never, NS, "web", 1);
    await assert.rejects(scaleApp(cluster.apps as never, NS, "web", 2), VolumesReplicaError);
  });
});

describe("deleteVolume PV lookup", () => {
  it("does not report retained data when the PV is already gone", async () => {
    const cluster = setup();
    cluster.pvs.clear();
    const result = await deleteApp(asClients(cluster), NS, "web", true);
    assert.equal(result.dataRetained, false);
    assert.equal(cluster.pvcs.has("data"), false);
  });
});
