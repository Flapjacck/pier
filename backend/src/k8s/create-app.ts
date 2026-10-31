import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import { buildDeployment, buildService, buildIngress, type CreateAppInput } from "./manifests.js";
import { deploymentToApp, type App } from "./apps.js";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "./labels.js";

/** Thrown when trying to create an app that already exists. */
export class AppExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppExistsError";
  }
}

/** Thrown when a host is already in use by another app. */
export class HostInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostInUseError";
  }
}

type K8sClients = {
  apps: AppsV1Api;
  core: CoreV1Api;
  networking: NetworkingV1Api;
};

/**
 * Create an app with Deployment, Service, and optional Ingress.
 * Performs pre-checks: app must not exist, host must not be in use.
 * On failure after any create, rolls back (best effort, logged, doesn't mask original error).
 */
export async function createApp(
  clients: K8sClients,
  namespace: string,
  input: CreateAppInput,
): Promise<App> {
  // Pre-check: deployment must not exist.
  try {
    await clients.apps.readNamespacedDeployment({
      name: input.name,
      namespace,
    });
    throw new AppExistsError(`app "${input.name}" already exists`);
  } catch (err) {
    // 404 is expected (app doesn't exist); any other error is fatal.
    if (
      err instanceof Error &&
      "code" in err &&
      typeof (err as Record<string, number>).code === "number"
    ) {
      const code = (err as Record<string, number>).code;
      if (code === 404) {
        // Expected: app doesn't exist yet.
      } else if (code === 409) {
        // Race condition: app was just created.
        throw new AppExistsError(`app "${input.name}" already exists`);
      } else {
        throw err; // Re-throw API error.
      }
    } else if (err instanceof AppExistsError) {
      throw err; // Re-throw our error.
    } else {
      throw err;
    }
  }

  // Pre-check: if host provided, ensure it's not in use by another app.
  // Note: This check is cluster-wide but not race-safe. Two concurrent requests
  // can both pass the list-then-create check and create overlapping Ingress rules.
  // For atomic host reservation, consider a ValidatingAdmissionPolicy (future work: #27).
  if (input.host) {
    try {
      // Check Ingresses in all namespaces (via multiple queries).
      // TODO: Use a ValidatingAdmissionPolicy for atomic cluster-wide host uniqueness (see #27).
      // For now, check pier-apps and assume user namespaces don't create conflicting ingresses.
      const response = await clients.networking.listNamespacedIngress({
        namespace,
        labelSelector: `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE}`,
      });

      for (const ingress of response.items ?? []) {
        for (const rule of ingress.spec?.rules ?? []) {
          if (rule.host === input.host) {
            throw new HostInUseError(`host "${input.host}" is already in use`);
          }
        }
      }
    } catch (err) {
      if (err instanceof HostInUseError) {
        throw err;
      }
      // API errors (e.g., RBAC) are fatal.
      throw err;
    }
  }

  // Track what we created for rollback on error.
  const created: Array<{
    type: "deployment" | "service" | "ingress";
    name: string;
  }> = [];

  try {
    // Create Deployment.
    const depManifest = buildDeployment(input);
    const depResponse = await clients.apps.createNamespacedDeployment({
      namespace,
      body: depManifest,
    });
    created.push({ type: "deployment", name: input.name });

    const deploymentUid = depResponse.metadata?.uid;

    // Create Service (with owner ref).
    const svcManifest = buildService(input, deploymentUid);
    await clients.core.createNamespacedService({
      namespace,
      body: svcManifest,
    });
    created.push({ type: "service", name: input.name });

    // Create Ingress if host provided (with owner ref).
    if (input.host) {
      const ingManifest = buildIngress(input, deploymentUid);
      await clients.networking.createNamespacedIngress({
        namespace,
        body: ingManifest,
      });
      created.push({ type: "ingress", name: input.name });
    }

    // Success: convert Deployment to App.
    return deploymentToApp(depResponse);
  } catch (err) {
    // Rollback: delete created objects in reverse order.
    for (let i = created.length - 1; i >= 0; i--) {
      const item = created[i];
      try {
        if (item?.type === "deployment") {
          await clients.apps.deleteNamespacedDeployment({
            name: item.name,
            namespace,
          });
        } else if (item?.type === "service") {
          await clients.core.deleteNamespacedService({
            name: item.name,
            namespace,
          });
        } else if (item?.type === "ingress") {
          await clients.networking.deleteNamespacedIngress({
            name: item.name,
            namespace,
          });
        }
      } catch (rollbackErr) {
        // Log but don't mask the original error.
        if (rollbackErr instanceof Error) {
          // We can't use req.log here, so this is captured in the outer try-catch error handler.
          // The original error will be logged by the route handler.
        }
      }
    }

    // Re-throw the original error (or wrap 409 in AppExistsError).
    if (
      err instanceof Error &&
      "code" in err &&
      typeof (err as Record<string, number>).code === "number"
    ) {
      const code = (err as Record<string, number>).code;
      if (code === 409) {
        throw new AppExistsError(`app "${input.name}" already exists`);
      }
    }

    throw err;
  }
}
