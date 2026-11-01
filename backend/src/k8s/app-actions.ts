import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import { deploymentToApp, type App } from "./apps.js";
import { getLiveApp } from "./app-lookup.js";
import { apiStatusCode } from "./api-errors.js";

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
  const existing = await getLiveApp(apps, namespace, name);
  if (!existing) {
    throw new Error("app not found");
  }

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

  const updated = await getLiveApp(apps, namespace, name);
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
  const existing = await getLiveApp(apps, namespace, name);
  if (!existing) {
    throw new Error("app not found");
  }

  const restartedAt = now.toISOString();

  const patches: Array<{
    op: "add" | "replace";
    path: string;
    value?: string | Record<string, string>;
  }> = [];

  if (existing.spec?.template?.metadata?.annotations) {
    patches.push({
      op: "replace",
      path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
      value: restartedAt,
    });
  } else {
    patches.push({
      op: "add",
      path: "/spec/template/metadata/annotations",
      value: {
        "kubectl.kubernetes.io/restartedAt": restartedAt,
      },
    });
  }

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

type K8sClients = {
  apps: AppsV1Api;
  core: CoreV1Api;
  networking: NetworkingV1Api;
};

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

  try {
    await networking.deleteNamespacedIngress({ namespace, name });
  } catch (err) {
    if (apiStatusCode(err) !== 404) {
      throw err;
    }
  }

  try {
    await core.deleteNamespacedService({ namespace, name });
  } catch (err) {
    if (apiStatusCode(err) !== 404) {
      throw err;
    }
  }

  try {
    await apps.deleteNamespacedDeployment({
      namespace,
      name,
      body: {
        propagationPolicy: "Foreground",
      },
    });
  } catch (err) {
    if (apiStatusCode(err) !== 404) {
      throw err;
    }
  }
}
