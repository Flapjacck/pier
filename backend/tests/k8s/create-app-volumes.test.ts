import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../../src/k8s/create-app.js";
import { VolumeQuotaExceededError } from "../../src/k8s/volumes/errors.js";
import { asClients, boundPvc, fakeVolumeCluster } from "../helpers/fake-volume-cluster.js";

const NS = "pier-apps";
const base = { name: "web", image: "nginx:1.27", port: 80, replicas: 1 };

describe("createApp volumes", () => {
  it("creates the PVC, mounts it, labels it and uses Recreate", async () => {
    const cluster = fakeVolumeCluster();
    const app = await createApp(asClients(cluster), NS, { ...base, volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] });
    const d = cluster.deployments.get("web");
    assert.equal(d?.spec?.strategy?.type, "Recreate");
    assert.equal(d?.spec?.template?.spec?.volumes?.[0]?.persistentVolumeClaim?.claimName, "web-data");
    assert.equal(cluster.pvcs.get("web-data")?.metadata?.labels?.["pier.app"], "web");
    assert.deepEqual(app.volumes, [{ name: "web-data", mountPath: "/data" }]);
  });

  it("deletes created PVCs and unlabels attached ones when the Deployment create fails", async () => {
    const cluster = fakeVolumeCluster({ failDeploymentCreate: true });
    cluster.pvcs.set("kept", boundPvc("kept"));
    await assert.rejects(createApp(asClients(cluster), NS, {
      ...base,
      volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }, { name: "kept", mountPath: "/kept" }],
    }));
    assert.equal(cluster.pvcs.has("web-data"), false);
    assert.equal(cluster.pvcs.get("kept")?.metadata?.labels?.["pier.app"], undefined);
  });

  it("leaves nothing behind when the second new volume hits the quota", async () => {
    const cluster = fakeVolumeCluster({ quotaFailPvcs: ["two"] });
    await assert.rejects(createApp(asClients(cluster), NS, {
      ...base,
      volumes: [{ name: "one", mountPath: "/one", size: "1Gi" }, { name: "two", mountPath: "/two", size: "1Gi" }],
    }), VolumeQuotaExceededError);
    assert.equal(cluster.pvcs.size, 0);
    assert.equal(cluster.deployments.size, 0);
  });
});
