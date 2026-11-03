import assert from "node:assert/strict";
import test from "node:test";
import { isValidMountPath, mountProblems, sizeProblem } from "../../../src/k8s/volumes/validation.js";

test("validates mount path edge cases", () => {
  for (const path of ["/", "//", "/data/", "/data/../x", "/proc/x", "/run/secrets/x", `/${"a".repeat(255)}`]) {
    assert.equal(isValidMountPath(path), false);
  }
  assert.equal(isValidMountPath("/data"), true);
});

test("validates volume sizes", () => {
  assert.ok(sizeProblem("99Mi"));
  assert.equal(sizeProblem("100Mi"), undefined);
  assert.equal(sizeProblem("10Gi"), undefined);
  assert.ok(sizeProblem("11Gi"));
  assert.ok(sizeProblem("1.5Gi"));
});

test("rejects duplicate, overlapping, and excessive mounts", () => {
  assert.ok(mountProblems([{ name: "a", mountPath: "/data" }, { name: "a", mountPath: "/other" }]));
  assert.ok(mountProblems([{ name: "a", mountPath: "/data" }, { name: "b", mountPath: "/data/cache" }]));
  assert.ok(mountProblems([1, 2, 3, 4].map((n) => ({ name: `v${n}`, mountPath: `/data${n}` }))));
});
