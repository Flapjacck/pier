import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KubeConfigLoader } from "../../src/k8s/client.js";
import { createK8sClients } from "../../src/k8s/clients.js";
import { countingLoader } from "../helpers/fake-kubeconfig-loader.js";

describe("createK8sClients", () => {
  it("calls the loader once and returns every API client", () => {
    const loader = countingLoader();
    const result = createK8sClients({ kubeconfig: undefined }, loader.load);

    assert.equal(loader.calls(), 1);
    assert.ok(result.ok);
    const { core, version, apps, networking, mode } = result.clients;
    assert.ok(core && version && apps && networking);
    assert.equal(mode, "kubeconfig");
  });

  it("passes config.kubeconfig to the loader", () => {
    let seenPath: string | undefined;
    const base = countingLoader();
    const load: KubeConfigLoader = (kubeconfigPath) => {
      seenPath = kubeconfigPath;
      return base.load(kubeconfigPath);
    };

    createK8sClients({ kubeconfig: "/etc/pier/kubeconfig.yaml" }, load);
    assert.equal(seenPath, "/etc/pier/kubeconfig.yaml");
  });

  it("keeps the loader's mode (in-cluster)", () => {
    const base = countingLoader();
    const load: KubeConfigLoader = (kubeconfigPath) => ({
      ...base.load(kubeconfigPath),
      mode: "in-cluster",
    });

    const result = createK8sClients({ kubeconfig: undefined }, load);
    assert.ok(result.ok);
    assert.equal(result.clients.mode, "in-cluster");
  });

  it("returns ok: false instead of throwing when the loader fails", () => {
    const load: KubeConfigLoader = () => {
      throw new Error("cannot read kubeconfig");
    };

    const result = createK8sClients({ kubeconfig: "/nonexistent.yaml" }, load);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.error.message.includes("cannot read kubeconfig"));
  });

  it("wraps non-Error throws in an Error", () => {
    const load: KubeConfigLoader = () => {
      throw "boom";
    };

    const result = createK8sClients({ kubeconfig: undefined }, load);
    assert.ok(!result.ok && result.error instanceof Error && result.error.message === "boom");
  });
});
