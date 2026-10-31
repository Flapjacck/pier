import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import type { FastifyBaseLogger } from "fastify";
import { buildDeployment, buildService, buildIngress, type CreateAppInput } from "./manifests/index.js";
import { deploymentToApp, type App } from "./apps.js";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "./labels.js";
import { apiStatusCode } from "./api-errors.js";

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
 * Optional logger logs each rollback failure with resource kind and name (no secrets).
 */
export async function createApp(
  clients: K8sClients,
  namespace: string,
  input: CreateAppInput,
  logger?: Pick<FastifyBaseLogger, "warn">,
): Promise<App> {
  // Pre-check: deployment must not exist.
  try {
    await clients.apps.readNamespacedDeployment({
      name: input.name,
      namespace,
    });
    throw new AppExistsError(`app "${input.name}" already exists`);
  } catch (err) {
    if (err instanceof AppExistsError) {
      throw err;
    }
    const code = apiStatusCode(err);
    if (code === 404) {
      // Expected: app doesn't exist yet.
    } else if (code === 409) {
      // Race condition: app was just created.
      throw new AppExistsError(`app "${input.name}" already exists`);
    } else {
      throw err; // Re-throw API error.
    }
  }

  // Pre-check: if host provided, ensure it's not in use by another Pier-managed app.
  // This check scans Ingresses in the app namespace with the Pier managed-by label.
  // Note: Not race-safe; concurrent requests can both pass the check and create overlapping
  // Ingress rules. With a single backend replica (deployment.yaml.tmpl), the check is
  // effectively serialized by the create-app mutex. For multi-replica backends, a real
  // reservation (e.g., Lease or ConfigMap) would be needed.
  if (input.host) {
    try {
      const response = await clients.networking.listNamespacedIngress({
        namespace,
        labelSelector: `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE}`,
      });

      for (const ingress of response.items ?? []) {
        for (const rule of ingress.spec?.rules ?? []) {
          if (rule.host?.toLowerCase() === input.host?.toLowerCase()) {
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

    // Success: convert Deployment to App, including host if provided.
    return deploymentToApp(depResponse, input.host);
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
        // Log rollback failure but don't mask the original error.
        logger?.warn(
          { kind: item?.type ?? "unknown", name: item?.name ?? "unknown", err: rollbackErr },
          "rollback delete failed",
        );
      }
    }

    // Re-throw the original error (or wrap 409 in AppExistsError).
    const code = apiStatusCode(err);
    if (code === 409) {
      throw new AppExistsError(`app "${input.name}" already exists`);
    }

    throw err;
  }
}

/**
 * Module-level mutex for serializing app creation.
 * This ensures the host check and create are atomic from the perspective of concurrent requests,
 * which is correct only while the backend runs one replica (deployment.yaml.tmpl replicas: 1).
 * If replicas increase, a real reservation (e.g., Lease or ConfigMap) is needed.
 */
let createMutex: Promise<void> = Promise.resolve();

/**
 * Acquire and release the creation mutex.
 * Each createApp call chains off the tail of this promise.
 */
export async function createAppSeralized(
  clients: K8sClients,
  namespace: string,
  input: CreateAppInput,
  logger?: Pick<FastifyBaseLogger, "warn">,
): Promise<App> {
  let result: App;
  let thrownErr: Error | undefined;

  createMutex = createMutex.then(
    async () => {
      try {
        result = await createApp(clients, namespace, input, logger);
      } catch (err) {
        thrownErr = err instanceof Error ? err : new Error(String(err));
      }
    },
    async () => {
      // If the previous call failed, continue anyway (don't let one poison the chain).
      try {
        result = await createApp(clients, namespace, input, logger);
      } catch (err) {
        thrownErr = err instanceof Error ? err : new Error(String(err));
      }
    },
  );

  await createMutex;

  if (thrownErr) {
    throw thrownErr;
  }

  // result will be assigned if no error
  return result!;
}
