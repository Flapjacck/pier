import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import { PatchStrategy, setHeaderOptions } from "@kubernetes/client-node";
import { deploymentToApp, type App } from "./apps.js";
import { getLiveApp } from "./app-lookup.js";
import { apiStatusCode } from "./api-errors.js";
import { APP_LABEL } from "./labels.js";

export type DeletedAppResource = "deployment" | "service" | "ingress";

export type DeleteAppResult = {
  deleted: DeletedAppResource[];
};

type K8sClients = {
  apps: AppsV1Api;
  core: CoreV1Api;
  networking: NetworkingV1Api;
};

async function deleteIfExists(
  del: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await del();
    return true;
  } catch (err) {
    if (apiStatusCode(err) === 404) {
      return false;
    }
    throw err;
  }
}

/** Delete a namespaced object only when its pier.app label matches the app name. */
async function deleteLabeledResource(
  read: () => Promise<{ metadata?: { labels?: Record<string, string> } }>,
  del: () => Promise<unknown>,
  appName: string,
): Promise<boolean> {
  try {
    const resource = await read();
    if (resource.metadata?.labels?.[APP_LABEL] !== appName) {
      return false;
    }
    return deleteIfExists(del);
  } catch (err) {
    if (apiStatusCode(err) === 404) {
      return false;
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

  type JsonPatchAdd = {
    op: "add";
    path: string;
    value: string | Record<string, string>;
  };

  const restartedAtPath =
    "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt";

  const patches: JsonPatchAdd[] =
    existing.spec?.template?.metadata?.annotations
      ? [{ op: "add", path: restartedAtPath, value: restartedAt }]
      : [
          {
            op: "add",
            path: "/spec/template/metadata/annotations",
            value: { "kubectl.kubernetes.io/restartedAt": restartedAt },
          },
        ];

  await apps.patchNamespacedDeployment(
    { namespace, name, body: patches },
    setHeaderOptions("Content-Type", PatchStrategy.JsonPatch),
  );

  return { restartedAt };
}

/**
 * Delete an app and related Service/Ingress resources.
 * When the Deployment is live, deletes Deployment then Service and Ingress (404 tolerated).
 * When it is missing, removes orphaned Service/Ingress only if labelled pier.app=name.
 */
export async function deleteApp(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<DeleteAppResult> {
  const { networking, core, apps } = clients;
  const deleted: DeletedAppResource[] = [];

  const deployment = await getLiveApp(apps, namespace, name);

  if (deployment) {
    if (
      await deleteIfExists(() =>
        apps.deleteNamespacedDeployment({
          namespace,
          name,
          body: { propagationPolicy: "Foreground" },
        }),
      )
    ) {
      deleted.push("deployment");
    }
    if (await deleteIfExists(() => core.deleteNamespacedService({ namespace, name }))) {
      deleted.push("service");
    }
    if (await deleteIfExists(() => networking.deleteNamespacedIngress({ namespace, name }))) {
      deleted.push("ingress");
    }
    return { deleted };
  }

  if (
    await deleteLabeledResource(
      () => core.readNamespacedService({ namespace, name }),
      () => core.deleteNamespacedService({ namespace, name }),
      name,
    )
  ) {
    deleted.push("service");
  }

  if (
    await deleteLabeledResource(
      () => networking.readNamespacedIngress({ namespace, name }),
      () => networking.deleteNamespacedIngress({ namespace, name }),
      name,
    )
  ) {
    deleted.push("ingress");
  }

  return { deleted };
}
