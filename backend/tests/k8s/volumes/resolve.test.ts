import assert from "node:assert/strict";
import test from "node:test";
import { createFakeClients, FakeApiError } from "../../helpers/fake-clients.js";
import { resolveVolumes } from "../../../src/k8s/volumes/resolve.js";
import { buildPvc } from "../../../src/k8s/volumes/pvc.js";
import { VolumeInUseError, VolumeNotFoundError, VolumesReplicaError } from "../../../src/k8s/volumes/errors.js";

function setup() {
  const clients = createFakeClients();
  const deleted: string[] = [];
  if (!clients.storage) throw new Error("storage client missing");
  Object.assign(clients.storage, { readStorageClass: async () => ({}) });
  Object.assign(clients.apps, { listNamespacedDeployment: async () => ({ items: [] }) });
  Object.assign(clients.core, {
    listNamespacedPersistentVolumeClaim: async () => ({ items: [] }),
    createNamespacedPersistentVolumeClaim: async (request: { body: { metadata?: { name?: string } } }) => buildPvc(request.body.metadata?.name ?? "", "1Gi"),
    patchNamespacedPersistentVolumeClaim: async () => ({}),
    deleteNamespacedPersistentVolumeClaim: async (request: { name: string }) => { deleted.push(request.name); },
  });
  return { clients, deleted };
}

test("resolveVolumes creates new and attaches existing volumes", async () => {
  const { clients } = setup();
  const result = await resolveVolumes(clients, "pier-apps", "web", [{ name: "data", mountPath: "/data", size: "1Gi" }], 1);
  assert.deepEqual(result.created, ["data"]);
  const existing = setup();
  Object.assign(existing.clients.core, { listNamespacedPersistentVolumeClaim: async () => ({ items: [buildPvc("data", "1Gi")] }) });
  const attached = await resolveVolumes(existing.clients, "pier-apps", "web", [{ name: "data", mountPath: "/data" }], 1);
  assert.deepEqual(attached.newlyAttached, ["data"]);
});

test("resolveVolumes rejects in-use, missing, and multiple-replica mounts", async () => {
  const inUse = setup();
  Object.assign(inUse.clients.apps, { listNamespacedDeployment: async () => ({ items: [{ metadata: { labels: { "pier.app": "other" } }, spec: { template: { spec: { volumes: [{ name: "vol-data", persistentVolumeClaim: { claimName: "data" } }], containers: [{ name: "app", volumeMounts: [{ name: "vol-data", mountPath: "/data" }] }] } } } }] }) });
  await assert.rejects(resolveVolumes(inUse.clients, "pier-apps", "web", [{ name: "data", mountPath: "/data" }], 1), VolumeInUseError);
  await assert.rejects(resolveVolumes(setup().clients, "pier-apps", "web", [{ name: "data", mountPath: "/data" }], 1), VolumeNotFoundError);
  await assert.rejects(resolveVolumes(setup().clients, "pier-apps", "web", [{ name: "data", mountPath: "/data", size: "1Gi" }], 2), VolumesReplicaError);
});

test("resolveVolumes rolls back a partial create", async () => {
  const { clients, deleted } = setup();
  let count = 0;
  Object.assign(clients.core, {
    createNamespacedPersistentVolumeClaim: async (request: { body: { metadata?: { name?: string } } }) => {
      count++;
      if (count === 2) throw new FakeApiError(403, "exceeded quota");
      return buildPvc(request.body.metadata?.name ?? "", "1Gi");
    },
  });
  await assert.rejects(resolveVolumes(clients, "pier-apps", "web", [
    { name: "one", mountPath: "/one", size: "1Gi" },
    { name: "two", mountPath: "/two", size: "1Gi" },
  ], 1));
  assert.deepEqual(deleted, ["one"]);
});
