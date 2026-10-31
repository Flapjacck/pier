import type { K8sClients, K8sClientsResult } from "../../src/k8s/clients";
import type * as k8s from "@kubernetes/client-node";

/**
 * Create a minimal fake K8sClients for testing.
 * Each API client is a mock that can be customized per test.
 */
export function createFakeClients(
  overrides?: Partial<K8sClients>,
): K8sClients {
  return {
    mode: "kubeconfig",
    core: {} as k8s.CoreV1Api,
    version: {} as k8s.VersionApi,
    apps: {} as k8s.AppsV1Api,
    networking: {} as k8s.NetworkingV1Api,
    log: {} as k8s.Log,
    ...overrides,
  };
}

/**
 * Create a successful K8sClientsResult for testing.
 */
export function createFakeClientsResult(
  overrides?: Partial<K8sClients>,
): K8sClientsResult {
  return {
    ok: true,
    clients: createFakeClients(overrides),
  };
}

/**
 * Create a failed K8sClientsResult for testing.
 */
export function createFailedClientsResult(message = "cluster unreachable"): K8sClientsResult {
  return {
    ok: false,
    error: new Error(message),
  };
}

/**
 * Error with a code property (mimics k8s API error).
 */
export class FakeApiError extends Error {
  code: number;

  constructor(code: number, message = `API error ${code}`) {
    super(message);
    this.code = code;
    this.name = "FakeApiError";
  }
}

