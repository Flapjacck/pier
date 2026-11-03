import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "./fake-clients.js";
import { fakeVolumeCluster, type FakeVolumeClusterOptions } from "./fake-volume-cluster.js";
import { testConfig } from "./test-config.js";

/** buildApp() wired to an in-memory volume cluster, for route tests. */
export async function volumeTestApp(opts: FakeVolumeClusterOptions = {}) {
  const cluster = fakeVolumeCluster(opts);
  const k8s = createFakeClientsResult({
    apps: cluster.apps as never,
    core: cluster.core as never,
    networking: cluster.networking as never,
    storage: cluster.storage as never,
  });
  const app = await buildApp(testConfig(), { logger: false, k8s });
  return { app, cluster };
}
