import assert from "node:assert/strict";
import test from "node:test";
import { buildPvc, pvcToVolume } from "../../../src/k8s/volumes/pvc.js";

test("buildPvc creates a managed RWO claim without owner references", () => {
  const pvc = buildPvc("web-data", "1Gi");
  assert.equal(pvc.spec?.storageClassName, "pier-local");
  assert.deepEqual(pvc.spec?.resources?.requests, { storage: "1Gi" });
  assert.equal(pvc.spec?.accessModes?.[0], "ReadWriteOnce");
  assert.equal(pvc.metadata?.labels?.["app.kubernetes.io/managed-by"], "pier");
  assert.equal(pvc.metadata?.ownerReferences, undefined);
});

test("pvcToVolume maps status, size, and attachment", () => {
  const volume = pvcToVolume({
    metadata: { name: "web-data", creationTimestamp: new Date("2025-01-01T00:00:00Z") },
    spec: { resources: { requests: { storage: "1Gi" } } },
    status: { phase: "Bound" },
  }, { app: "web", mountPath: "/data" });
  assert.deepEqual(volume, {
    name: "web-data", size: "1Gi", status: "bound", app: "web", mountPath: "/data",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
});
