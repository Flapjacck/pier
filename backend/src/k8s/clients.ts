import * as k8s from "@kubernetes/client-node";
import type { Config } from "../config";
import { loadKubeConfig } from "./client";
import type { KubeConfigMode } from "./client";

/**
 * K8s API clients built once at startup.
 * Includes mode to distinguish in-cluster vs. kubeconfig for logging and responses.
 */
export type K8sClients = {
  mode: KubeConfigMode;
  core: k8s.CoreV1Api;
  version: k8s.VersionApi;
  apps: k8s.AppsV1Api;
  networking: k8s.NetworkingV1Api;
};

/** Result of building clients once: either they loaded or an error occurred. */
export type K8sClientsResult =
  | { ok: true; clients: K8sClients }
  | { ok: false; error: Error };

/**
 * Build all K8s API clients once by loading the kubeconfig once.
 * Never throws; errors are wrapped in { ok: false, error }.
 * The loader function is injectable for testing.
 */
export function createK8sClients(
  config: Pick<Config, "kubeconfig">,
  load: (kubeconfigPath?: string) => { kc: k8s.KubeConfig; mode: KubeConfigMode } = loadKubeConfig,
): K8sClientsResult {
  try {
    // Load the kubeconfig once.
    const { kc, mode } = load(config.kubeconfig);

    // Build all four API clients from the loaded config.
    const core = kc.makeApiClient(k8s.CoreV1Api);
    const version = kc.makeApiClient(k8s.VersionApi);
    const apps = kc.makeApiClient(k8s.AppsV1Api);
    const networking = kc.makeApiClient(k8s.NetworkingV1Api);

    return {
      ok: true,
      clients: { mode, core, version, apps, networking },
    };
  } catch (err) {
    // Return the error without throwing so the app can start and reply 503.
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
