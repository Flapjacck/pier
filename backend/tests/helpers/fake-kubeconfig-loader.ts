import path from "node:path";
import * as k8s from "@kubernetes/client-node";
import type { KubeConfigLoader } from "../../src/k8s/client.js";
import type { K8sClients } from "../../src/k8s/clients.js";

export const FIXTURE_KUBECONFIG = path.join(import.meta.dirname, "../fixtures/kubeconfig.yaml");

type FakeApis = Partial<Omit<K8sClients, "mode">>;

/**
 * A kubeconfig loader that counts its calls. It returns the fixture kubeconfig,
 * but makeApiClient() hands back the given fakes so no request leaves the process.
 */
export function countingLoader(apis: FakeApis = {}): {
  load: KubeConfigLoader;
  calls: () => number;
} {
  let calls = 0;

  const load: KubeConfigLoader = () => {
    calls += 1;
    const kc = new k8s.KubeConfig();
    kc.loadFromFile(FIXTURE_KUBECONFIG);

    const fakesByClass = new Map<unknown, unknown>([
      [k8s.CoreV1Api, apis.core ?? {}],
      [k8s.VersionApi, apis.version ?? {}],
      [k8s.AppsV1Api, apis.apps ?? {}],
      [k8s.NetworkingV1Api, apis.networking ?? {}],
    ]);
    kc.makeApiClient = ((apiClass: unknown) =>
      fakesByClass.get(apiClass)) as typeof kc.makeApiClient;

    return { kc, mode: "kubeconfig" };
  };

  return { load, calls: () => calls };
}
