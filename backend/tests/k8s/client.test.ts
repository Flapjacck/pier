import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadKubeConfig } from "../../src/k8s/client.js";

const FIXTURE_KUBECONFIG = path.join(import.meta.dirname, "../fixtures/kubeconfig.yaml");
const SA_DIR = "var/run/secrets/kubernetes.io/serviceaccount";
const ENV_KEYS = ["KUBECONFIG", "KUBERNETES_SERVICE_HOST", "KUBERNETES_SERVICE_PORT"] as const;

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
let tempDirs: string[] = [];

/** Temp dir that mimics the ServiceAccount volume a pod gets mounted. */
function fakeServiceAccountRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pier-sa-"));
  tempDirs.push(root);
  const saDir = path.join(root, SA_DIR);
  fs.mkdirSync(saDir, { recursive: true });
  fs.writeFileSync(path.join(saDir, "token"), "fake-sa-token");
  fs.writeFileSync(path.join(saDir, "ca.crt"), "fake-ca");
  fs.writeFileSync(path.join(saDir, "namespace"), "default");
  return root;
}

// These tests mutate process.env, so snapshot and restore it around each one.
beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("loadKubeConfig", () => {
  it("loads in-cluster config and passes validation", () => {
    // loadFromCluster names the context "inClusterContext" but the cluster "inCluster",
    // so validation must resolve the cluster through the context, not by context name.
    process.env.KUBERNETES_SERVICE_HOST = "10.43.0.1";
    process.env.KUBERNETES_SERVICE_PORT = "443";
    const root = fakeServiceAccountRoot();

    const { kc, mode } = loadKubeConfig(FIXTURE_KUBECONFIG, root);

    assert.equal(mode, "in-cluster");
    assert.equal(kc.getCurrentContext(), "inClusterContext");
    assert.equal(kc.getCurrentCluster()?.server, "https://10.43.0.1:443");
  });

  it("loads the given kubeconfig file when not in-cluster", () => {
    const { kc, mode } = loadKubeConfig(FIXTURE_KUBECONFIG);

    assert.equal(mode, "kubeconfig");
    assert.equal(kc.getCurrentContext(), "test-context");
    assert.equal(kc.getCurrentCluster()?.name, "test-cluster");
  });

  it("falls back to loadFromDefault (KUBECONFIG env) when no path is given", () => {
    // loadFromDefault reads process.env.KUBECONFIG itself; point it at the fixture.
    process.env.KUBECONFIG = FIXTURE_KUBECONFIG;

    const { kc, mode } = loadKubeConfig(undefined);

    assert.equal(mode, "kubeconfig");
    assert.equal(kc.getCurrentContext(), "test-context");
  });

  it("throws when the file is not valid YAML", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pier-kc-"));
    tempDirs.push(dir);
    const badFile = path.join(dir, "bad.yaml");
    fs.writeFileSync(badFile, "not yaml: [\n");

    assert.throws(() => loadKubeConfig(badFile));
  });

  it("throws a clear error when the context has no matching cluster", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pier-kc-"));
    tempDirs.push(dir);
    const file = path.join(dir, "no-cluster.yaml");
    const fixture = fs.readFileSync(FIXTURE_KUBECONFIG, "utf8");
    fs.writeFileSync(file, fixture.replace("cluster: test-cluster", "cluster: missing-cluster"));

    assert.throws(() => loadKubeConfig(file), /context "test-context" has no cluster/);
  });
});
