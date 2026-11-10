import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadBuildConfig } from "../src/config-builds.js";

describe("loadBuildConfig", () => {
  it("defaults to the in-cluster registry, pier-system and the pier-buildkit daemon", () => {
    const cfg = loadBuildConfig({});
    assert.equal(cfg.registry, "localhost:30500");
    assert.equal(cfg.pushRegistry, "registry.pier-system.svc.cluster.local:5000");
    assert.equal(cfg.namespace, "pier-system");
    assert.equal(cfg.buildkitAddr, "tcp://buildkitd.pier-buildkit.svc.cluster.local:1234");
    assert.equal(cfg.timeoutSeconds, 900);
  });

  it("derives the push registry from a custom build namespace", () => {
    assert.equal(loadBuildConfig({ PIER_BUILD_NAMESPACE: "builds" }).pushRegistry, "registry.builds.svc.cluster.local:5000");
  });

  it("pins every build image by tag and Railpack by checksum", () => {
    const cfg = loadBuildConfig({});
    for (const image of Object.values(cfg.images)) assert.match(image, /:v?\d+\.\d+\.\d+$/);
    assert.match(cfg.railpack.frontend, new RegExp(`:v${cfg.railpack.version.replace(/\./g, "\\.")}$`));
    assert.match(cfg.railpack.sha256.x86_64, /^[0-9a-f]{64}$/);
    assert.match(cfg.railpack.sha256.arm64, /^[0-9a-f]{64}$/);
  });

  for (const [key, value] of [
    ["PIER_BUILD_REGISTRY", "http://localhost:30500"],
    ["PIER_BUILD_PUSH_REGISTRY", "registry"],
    ["PIER_BUILD_NAMESPACE", "Not_A_Label"],
    ["PIER_BUILDKIT_ADDR", "unix:///run/buildkit.sock"],
    ["PIER_BUILD_TIMEOUT_SECONDS", "30"],
    ["PIER_BUILD_TIMEOUT_SECONDS", "abc"],
  ] as const) {
    it(`rejects ${key}=${value}`, () => {
      assert.throws(() => loadBuildConfig({ [key]: value }), new RegExp(key));
    });
  }
});
