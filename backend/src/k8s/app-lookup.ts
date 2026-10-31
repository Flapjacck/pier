import type { AppsV1Api, NetworkingV1Api, V1Deployment } from "@kubernetes/client-node";
import type { App } from "./apps.js";
import { APP_LABEL } from "./labels.js";
import { apiStatusCode } from "./api-errors.js";
import { deploymentToApp } from "./apps.js";

/** Read a live (non-terminating) Deployment for an app by name.
 * Returns undefined if not found (404), being terminated, or labels don't match pier.app=name.
 * Rethrows other API errors (403, 500, etc) for the caller to handle.
 */
export async function getLiveApp(
  apps: AppsV1Api,
  namespace: string,
  name: string,
): Promise<V1Deployment | undefined> {
  try {
    const response = await apps.readNamespacedDeployment({
      name,
      namespace,
    });

    // Reject if marked for deletion or label doesn't match.
    if (response.metadata?.deletionTimestamp) {
      return undefined;
    }
    if (response.metadata?.labels?.[APP_LABEL] !== name) {
      return undefined;
    }

    return response;
  } catch (err) {
    const code = apiStatusCode(err);
    if (code === 404) {
      return undefined;
    }
    // Rethrow other errors (403, 500, etc).
    throw err;
  }
}

/** Read the host for an app from its Ingress.
 * Returns undefined if not found (404), being terminated, or missing pier.app label.
 * Otherwise returns the first rule's host (lowercased by the create route).
 * Rethrows other API errors for the caller to handle.
 */
export async function getAppHost(
  networking: NetworkingV1Api,
  namespace: string,
  name: string,
): Promise<string | undefined> {
  try {
    const response = await networking.readNamespacedIngress({
      name,
      namespace,
    });

    // Reject if marked for deletion or label doesn't match.
    if (response.metadata?.deletionTimestamp) {
      return undefined;
    }
    if (response.metadata?.labels?.[APP_LABEL] !== name) {
      return undefined;
    }

    // Extract host from the first rule.
    const host = response.spec?.rules?.[0]?.host;
    return host ? host.toLowerCase() : undefined;
  } catch (err) {
    const code = apiStatusCode(err);
    if (code === 404) {
      return undefined;
    }
    // Rethrow other errors.
    throw err;
  }
}

/** Read a live app by name, fetching both Deployment and Ingress.
 * Returns undefined if the app doesn't exist, is being terminated, or has no pier.app label.
 * Rethrows API errors (403, 500, etc) for the caller to handle.
 */
export async function getApp(
  clients: { apps: AppsV1Api; networking: NetworkingV1Api },
  namespace: string,
  name: string,
): Promise<App | undefined> {
  // Fetch the Deployment.
  const deployment = await getLiveApp(clients.apps, namespace, name);
  if (!deployment) {
    return undefined;
  }

  // Fetch the Ingress if it exists.
  const host = await getAppHost(clients.networking, namespace, name);

  // Convert to App, passing host if available.
  return deploymentToApp(deployment, host);
}
