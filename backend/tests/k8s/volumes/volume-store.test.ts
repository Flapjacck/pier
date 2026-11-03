import assert from "node:assert/strict";
import test from "node:test";
import { createFakeClients, FakeApiError } from "../../helpers/fake-clients.js";
import { buildPvc } from "../../../src/k8s/volumes/pvc.js";
import {
  createVolume, deleteVolume, deleteVolumeUnchecked,
} from "../../../src/k8s/volumes/volume-store.js";
import {
  StorageClassMissingError, VolumeExistsError, VolumeInUseError,
  VolumeNotFoundError, VolumeQuotaExceededError,
} from "../../../src/k8s/volumes/errors.js";

function managedPvc(name = "data") {
  return { ...buildPvc(name, "1Gi"), metadata: { ...buildPvc(name, "1Gi").metadata, name }, status: { phase: "Bound" as const } };
}

test("createVolume creates a managed PVC", async () => {
  const clients = createFakeClients();
  if (!clients.storage) throw new Error("storage client missing");
  Object.assign(clients.storage, { readStorageClass: async () => ({}) });
  Object.assign(clients.core, { createNamespacedPersistentVolumeClaim: async (request: { body: unknown }) => request.body });
  const volume = await createVolume(clients, "pier-apps", "data", "1Gi");
  assert.equal(volume.name, "data");
});

test("createVolume maps conflicts, quota, and missing StorageClass", async () => {
  const clients = createFakeClients();
  if (!clients.storage) throw new Error("storage client missing");
  Object.assign(clients.storage, { readStorageClass: async () => ({}) });
  Object.assign(clients.core, {
    createNamespacedPersistentVolumeClaim: async () => { throw new FakeApiError(409); },
  });
  await assert.rejects(createVolume(clients, "pier-apps", "data", "1Gi"), VolumeExistsError);
  Object.assign(clients.core, {
    createNamespacedPersistentVolumeClaim: async () => { throw new FakeApiError(403, "exceeded quota"); },
  });
  await assert.rejects(createVolume(clients, "pier-apps", "data", "1Gi"), VolumeQuotaExceededError);
  Object.assign(clients.storage, {
    readStorageClass: async () => { throw new FakeApiError(404); },
  });
  await assert.rejects(createVolume(clients, "pier-apps", "data", "1Gi"), StorageClassMissingError);
});

test("deleteVolume flips a retained PV before deleting its PVC", async () => {
  const clients = createFakeClients();
  const calls: string[] = [];
  Object.assign(clients.core, {
    readNamespacedPersistentVolumeClaim: async () => ({ ...managedPvc(), spec: { ...managedPvc().spec, volumeName: "pv-data" } }),
    readPersistentVolume: async () => ({ spec: { persistentVolumeReclaimPolicy: "Retain" } }),
    patchPersistentVolume: async () => { calls.push("patch"); },
    deleteNamespacedPersistentVolumeClaim: async () => { calls.push("delete"); },
  });
  Object.assign(clients.apps, { listNamespacedDeployment: async () => ({ items: [] }) });
  await deleteVolume(clients, "pier-apps", "data");
  assert.deepEqual(calls, ["patch", "delete"]);
});

test("PV failure still deletes and reports retained data through the logger", async () => {
  const clients = createFakeClients();
  let warned = false;
  Object.assign(clients.core, {
    readNamespacedPersistentVolumeClaim: async () => ({ ...managedPvc(), spec: { ...managedPvc().spec, volumeName: "pv-data" } }),
    readPersistentVolume: async () => { throw new FakeApiError(403); },
    deleteNamespacedPersistentVolumeClaim: async () => undefined,
  });
  const result = await deleteVolumeUnchecked(clients, "pier-apps", "data", { warn: () => { warned = true; } });
  assert.equal(result.dataRetained, true);
  assert.equal(warned, true);
});

test("unbound PVC deletion does not read a PV", async () => {
  const clients = createFakeClients();
  let pvRead = false;
  Object.assign(clients.core, {
    readNamespacedPersistentVolumeClaim: async () => managedPvc(),
    readPersistentVolume: async () => { pvRead = true; return {}; },
    deleteNamespacedPersistentVolumeClaim: async () => undefined,
  });
  await deleteVolumeUnchecked(clients, "pier-apps", "data");
  assert.equal(pvRead, false);
});

test("deleteVolume rejects in-use, unmanaged, and missing PVCs", async () => {
  const clients = createFakeClients();
  Object.assign(clients.core, {
    readNamespacedPersistentVolumeClaim: async () => managedPvc(),
  });
  Object.assign(clients.apps, {
    listNamespacedDeployment: async () => ({ items: [{ metadata: { labels: { "pier.app": "web" } }, spec: { template: { spec: {
      volumes: [{ name: "vol-data", persistentVolumeClaim: { claimName: "data" } }],
      containers: [{ name: "app", volumeMounts: [{ name: "vol-data", mountPath: "/data" }] }],
    } } } }] }),
  });
  await assert.rejects(deleteVolume(clients, "pier-apps", "data"), VolumeInUseError);
  Object.assign(clients.core, { readNamespacedPersistentVolumeClaim: async () => ({ metadata: { name: "data" } }) });
  await assert.rejects(deleteVolumeUnchecked(clients, "pier-apps", "data"), VolumeNotFoundError);
  Object.assign(clients.core, { readNamespacedPersistentVolumeClaim: async () => { throw new FakeApiError(404); } });
  await assert.rejects(deleteVolumeUnchecked(clients, "pier-apps", "data"), VolumeNotFoundError);
});
