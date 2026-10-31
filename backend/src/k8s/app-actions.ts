import type { AppsV1Api, CoreV1Api, NetworkingV1Api, V1Deployment } from "@kubernetes/client-node";
import { deploymentToApp, type App } from "./apps.js";
import { apiStatusCode } from "./api-errors.js";

type K8sClients = {
  apps: AppsV1Api;
  core: CoreV1Api;
  networking: NetworkingV1Api;
};

/**
 * Get a live Deployment, or undefined if it doesn't exist or is being terminated.
 * A Deployment with deletionTimestamp is treated as gone (not deployable).
 */
export async function getLiveDeployment(
  apps: AppsV1Api,
  namespace: string,
  name: string,
): Promise<V1Deployment | undefined> {
  try {
    const dep = await apps.readNamespacedDeployment({ namespace, name });
    // If deletion is in progress, treat it as gone.
    if (dep.metadata?.deletionTimestamp) {
      return undefined;
    }
    return dep;
  } catch (err) {
    const code = apiStatusCode(err);
    if (code === 404) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Scale an app to a specific number of replicas.
 * Returns the updated App, or throws on error (404 if not found or terminating).
 */
export async function scaleApp(
  apps: AppsV1Api,
  namespace: string,
  name: string,
  replicas: number,
): Promise<App> {
  // First check that the Deployment exists and is live.
  const existing = await getLiveDeployment(apps, namespace, name);
  if (!existing) {
    throw new Error("app not found");
  }

  // Use replaceNamespacedDeploymentScale to avoid JSON Patch merge semantics.
  await apps.replaceNamespacedDeploymentScale({
    namespace,
    name,
    body: {
      metadata: {
        name,
        namespace,
      },
      spec: {
        replicas,
      },
    },
  });

  // Re-read the full Deployment to get the updated status.
  const updated = await getLiveDeployment(apps, namespace, name);
  if (!updated) {
    throw new Error("app not found");
  }

  return deploymentToApp(updated);
}

/**
 * Restart an app by adding/updating the kubectl.kubernetes.io/restartedAt annotation.
 * Uses JSON Patch to avoid merge-patch issues.
 * Returns { restartedAt: ISO string }.
 */
export async function restartApp(
  apps: AppsV1Api,
  namespace: string,
  name: string,
  now: Date = new Date(),
): Promise<{ restartedAt: string }> {
  // First check that the Deployment exists and is live.
  const existing = await getLiveDeployment(apps, namespace, name);
  if (!existing) {
    throw new Error("app not found");
  }

  const restartedAt = now.toISOString();

  // Construct JSON Patch operations.
  // If annotations already exist, add/replace the restartedAt annotation.
  // If annotations don't exist, create the whole annotations object.
  const patches: Array<{
    op: "add" | "replace";
    path: string;
    value?: string | Record<string, string>;
  }> = [];

  if (existing.spec?.template?.metadata?.annotations) {
    // Annotations exist; just add/replace the restartedAt one.
    patches.push({
      op: "add",
      path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
      value: restartedAt,
    });
  } else {
    // No annotations; create the whole annotations object.
    patches.push({
      op: "add",
      path: "/spec/template/metadata/annotations",
      value: {
        "kubectl.kubernetes.io/restartedAt": restartedAt,
      },
    });
  }

  // Apply the JSON Patch.
  // Use patchNamespacedDeployment with raw body (JSON Patch arrays are auto-detected).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (apps.patchNamespacedDeployment as any)({
    namespace,
    name,
    body: patches,
    headers: {
      "Content-Type": "application/json-patch+json",
    },
  });

  return { restartedAt };
}

/**
 * Delete an app and its Service and Ingress.
 * Deletes in order: Ingress, Service, Deployment (with Foreground propagation).
 * 404 errors are tolerated (already gone).
 * Throws on other errors.
 */
export async function deleteApp(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<void> {
  const { networking, core, apps } = clients;

  // Delete Ingress (404 is fine; may not exist or already deleted).
  try {
    await networking.deleteNamespacedIngress({
      namespace,
      name,
    });
  } catch (err) {
    const code = apiStatusCode(err);
    if (code !== 404) {
      throw err;
    }
  }

  // Delete Service (404 is fine).
  try {
    await core.deleteNamespacedService({
      namespace,
      name,
    });
  } catch (err) {
    const code = apiStatusCode(err);
    if (code !== 404) {
      throw err;
    }
  }

  // Delete Deployment with Foreground propagation (404 is fine).
  // Foreground delete ensures owned Service and Ingress are garbage-collected.
  try {
    await apps.deleteNamespacedDeployment({
      namespace,
      name,
      body: {
        propagationPolicy: "Foreground",
      },
    });
  } catch (err) {
    const code = apiStatusCode(err);
    if (code !== 404) {
      throw err;
    }
  }
}
