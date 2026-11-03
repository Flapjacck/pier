import assert from "node:assert/strict";
import test from "node:test";
import type { V1Container, V1PodSpec } from "@kubernetes/client-node";
import { strategyFor, volumeMountsOf, withVolumes } from "../../../src/k8s/volumes/pod-spec.js";

test("withVolumes adds mounts without mutating its input", () => {
  const container: V1Container = { name: "app" };
  const spec: V1PodSpec = { containers: [container] };
  const next = withVolumes(spec, container, [{ name: "data", mountPath: "/data" }]);
  assert.equal(spec.volumes, undefined);
  assert.equal(container.volumeMounts, undefined);
  assert.equal(next.volumes?.[0]?.persistentVolumeClaim?.claimName, "data");
  assert.equal(next.containers?.[0]?.volumeMounts?.[0]?.mountPath, "/data");
});

test("strategyFor selects Recreate only for mounted apps", () => {
  assert.deepEqual(strategyFor([{ name: "data", mountPath: "/data" }]), { type: "Recreate" });
  assert.deepEqual(strategyFor([]), { type: "RollingUpdate" });
});

test("volumeMountsOf round trips pod volume claims", () => {
  assert.deepEqual(volumeMountsOf({
    spec: { template: { spec: {
      volumes: [{ name: "vol-data", persistentVolumeClaim: { claimName: "data" } }],
      containers: [{ name: "app", volumeMounts: [{ name: "vol-data", mountPath: "/data" }] }],
    } } },
  }), [{ name: "data", mountPath: "/data" }]);
});
