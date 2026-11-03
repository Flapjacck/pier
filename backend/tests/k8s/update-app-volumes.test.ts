import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateApp } from "../../src/k8s/update-app.js";
import { QuotaExceededError } from "../../src/k8s/resource-fit.js";
import { VolumeInUseError, VolumeNotFoundError, VolumesReplicaError } from "../../src/k8s/volumes/errors.js";
import { asClients, boundPvc, fakeVolumeCluster, volumeDeployment } from "../helpers/fake-volume-cluster.js";

const NS = "pier-apps";
const tinyQuota = { metadata: { name: "pier-apps-quota" }, status: { hard: { "requests.cpu": "1" }, used: { "requests.cpu": "2" } } };

function withApp(mounts: Array<{ claim: string; mountPath: string }> = [], replicas = 1, opts = {}) {
  const cluster = fakeVolumeCluster(opts);
  cluster.deployments.set("web", volumeDeployment("web", mounts, replicas));
  for (const m of mounts) cluster.pvcs.set(m.claim, boundPvc(m.claim, "web"));
  return cluster;
}

function spec(cluster: ReturnType<typeof fakeVolumeCluster>) {
  const d = cluster.deployments.get("web");
  assert.ok(d?.spec);
  return d.spec;
}

describe("updateApp volumes", () => {
  it("creates a new volume when a size is given and switches to Recreate", async () => {
    const cluster = withApp();
    const app = await updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] });
    assert.ok(cluster.pvcs.has("web-data"));
    assert.equal(cluster.pvcs.get("web-data")?.metadata?.labels?.["pier.app"], "web");
    assert.equal(spec(cluster).strategy?.type, "Recreate");
    assert.deepEqual(app.volumes, [{ name: "web-data", mountPath: "/data" }]);
  });

  it("attaches an existing unattached volume without a size", async () => {
    const cluster = withApp();
    cluster.pvcs.set("kept", boundPvc("kept"));
    await updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "kept", mountPath: "/data" }] });
    assert.equal(cluster.pvcs.get("kept")?.metadata?.labels?.["pier.app"], "web");
  });

  it("rejects a missing volume without a size and a volume used by another app", async () => {
    const cluster = withApp();
    await assert.rejects(updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "nope", mountPath: "/data" }] }), VolumeNotFoundError);
    cluster.deployments.set("other", volumeDeployment("other", [{ claim: "shared", mountPath: "/s" }]));
    cluster.pvcs.set("shared", boundPvc("shared", "other"));
    await assert.rejects(updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "shared", mountPath: "/s" }] }), VolumeInUseError);
  });

  it("rejects more than one replica on an app that already has volumes", async () => {
    const cluster = withApp([{ claim: "data", mountPath: "/data" }]);
    await assert.rejects(updateApp(asClients(cluster), NS, "web", { replicas: 3 }), VolumesReplicaError);
    await assert.rejects(
      updateApp(asClients(cluster), NS, "web", { replicas: 2, volumes: [{ name: "data", mountPath: "/data" }] }),
      VolumesReplicaError,
    );
    assert.equal(spec(cluster).replicas, 1);
  });

  it("keeps a paused app at 0 replicas when its volumes change", async () => {
    const cluster = withApp([], 0);
    await updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] });
    assert.equal(spec(cluster).replicas, 0);
  });

  it("scales a multi-replica app down to 1 when the first volume is attached", async () => {
    const cluster = withApp([], 3);
    await updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] });
    assert.equal(spec(cluster).replicas, 1);
  });

  it("rolls back a newly created PVC when the quota pre-check fails", async () => {
    const cluster = withApp([], 1, { quotas: [tinyQuota] });
    await assert.rejects(
      updateApp(asClients(cluster), NS, "web", { image: "nginx:1.28", volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] }),
      QuotaExceededError,
    );
    assert.equal(cluster.pvcs.has("web-data"), false);
  });

  it("on a failed patch keeps labels on volumes the app already had and unlabels newly attached ones", async () => {
    const cluster = withApp([{ claim: "data", mountPath: "/data" }], 1, { failDeploymentPatch: true });
    cluster.pvcs.set("extra", boundPvc("extra"));
    await assert.rejects(updateApp(asClients(cluster), NS, "web", {
      volumes: [{ name: "data", mountPath: "/data" }, { name: "extra", mountPath: "/extra" }],
    }));
    assert.equal(cluster.pvcs.get("data")?.metadata?.labels?.["pier.app"], "web");
    assert.equal(cluster.pvcs.get("extra")?.metadata?.labels?.["pier.app"], undefined);
  });

  it("does not delete a new PVC when a step after the Deployment patch fails", async () => {
    const cluster = withApp([{ claim: "old", mountPath: "/old" }], 1, { failLabelPatch: ["old"] });
    await updateApp(asClients(cluster), NS, "web", { volumes: [{ name: "web-data", mountPath: "/data", size: "1Gi" }] });
    assert.ok(cluster.pvcs.has("web-data"));
    assert.equal(cluster.calls.filter((c) => c.startsWith("delete pvc")).length, 0);
  });

  it("detaches a volume, removes its app label and goes back to RollingUpdate", async () => {
    const cluster = withApp([{ claim: "data", mountPath: "/data" }]);
    const app = await updateApp(asClients(cluster), NS, "web", { volumes: [] });
    assert.equal(cluster.pvcs.get("data")?.metadata?.labels?.["pier.app"], undefined);
    assert.ok(cluster.pvcs.has("data"));
    assert.equal(spec(cluster).strategy?.type, "RollingUpdate");
    assert.deepEqual(app.volumes ?? [], []);
  });
});
