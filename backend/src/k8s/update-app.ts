import type { AppsV1Api, CoreV1Api, NetworkingV1Api, V1EnvVar } from "@kubernetes/client-node";
import { PatchStrategy, setHeaderOptions } from "@kubernetes/client-node";
import type { App } from "./apps.js";
import { deploymentPort } from "./apps.js";
import { getApp, getLiveApp } from "./app-lookup.js";
import { apiStatusCode } from "./api-errors.js";
import { checkResourceFit } from "./resource-fit.js";
import {
  mergeResources,
  resourcesFromContainer,
  resourcesProblem,
  toContainerResources,
  type AppResources,
  type PartialAppResources,
} from "./resources.js";

/** Fields PATCH /apps/:name can change. Anything left out stays as it is. */
export type UpdateAppInput = {
  image?: string;
  port?: number;
  replicas?: number;
  /** Replaces the whole env set ({} clears it). */
  env?: Record<string, string>;
  /** Merged onto the app's current requests/limits. */
  resources?: PartialAppResources;
};

/** The app doesn't exist (or is being deleted). */
export class AppNotFoundError extends Error {
  constructor(name: string) {
    super(`app "${name}" not found`);
    this.name = "AppNotFoundError";
  }
}

/** The merged resources are invalid on their own (e.g. a limit below its request). */
export class InvalidResourcesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResourcesError";
  }
}

export type JsonPatchOp = { op: "add" | "replace"; path: string; value: unknown };

const CONTAINER = "/spec/template/spec/containers/0";

/** Env map to a container env list, sorted by name (same order create-app uses). */
export function toEnvVars(env: Record<string, string>): V1EnvVar[] {
  return Object.keys(env)
    .sort()
    .map((name) => ({ name, value: env[name] }));
}

/**
 * JSON Patch ops for the Deployment. Pier apps have exactly one container ("app") with one
 * port named "http" and a tcpSocket readiness probe on it, so those are replaced wholesale.
 * `add` is used where the field might be missing (it replaces when present).
 */
export function buildUpdateOps(input: UpdateAppInput, resources?: AppResources): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  if (input.image !== undefined) {
    ops.push({ op: "replace", path: `${CONTAINER}/image`, value: input.image });
  }
  if (input.port !== undefined) {
    ops.push({ op: "add", path: `${CONTAINER}/ports`, value: [{ name: "http", containerPort: input.port }] });
    ops.push({
      op: "add",
      path: `${CONTAINER}/readinessProbe`,
      value: { tcpSocket: { port: input.port }, initialDelaySeconds: 2, periodSeconds: 5 },
    });
  }
  if (input.env !== undefined) {
    ops.push({ op: "add", path: `${CONTAINER}/env`, value: toEnvVars(input.env) });
  }
  if (resources !== undefined) {
    ops.push({ op: "add", path: `${CONTAINER}/resources`, value: toContainerResources(resources) });
  }
  if (input.replicas !== undefined) {
    ops.push({ op: "add", path: "/spec/replicas", value: input.replicas });
  }
  return ops;
}

type Clients = { apps: AppsV1Api; core: CoreV1Api; networking: NetworkingV1Api };
type Logger = { warn: (obj: object, msg: string) => void };

/**
 * Apply settings to a live app: validate merged resources, pre-check namespace limits and
 * quota, JSON-patch the Deployment (and the Service targetPort on a port change), then
 * return the updated App.
 */
export async function updateApp(
  clients: Clients,
  namespace: string,
  name: string,
  input: UpdateAppInput,
  log?: Logger,
): Promise<App> {
  const deployment = await getLiveApp(clients.apps, namespace, name);
  if (!deployment) throw new AppNotFoundError(name);

  const container = deployment.spec?.template?.spec?.containers?.[0];
  const currentResources = resourcesFromContainer(container);
  const nextResources = input.resources ? mergeResources(currentResources, input.resources) : undefined;
  if (nextResources) {
    const problem = resourcesProblem(nextResources);
    if (problem) throw new InvalidResourcesError(problem);
  }

  const portChanged = input.port !== undefined && input.port !== deploymentPort(deployment);
  const templateChanged =
    (input.image !== undefined && input.image !== container?.image) ||
    portChanged ||
    input.env !== undefined ||
    nextResources !== undefined;
  const currentReplicas = deployment.spec?.replicas ?? 1;

  await checkResourceFit(
    clients.core,
    namespace,
    {
      current: { resources: currentResources, replicas: currentReplicas },
      next: { resources: nextResources ?? currentResources, replicas: input.replicas ?? currentReplicas },
      surge: templateChanged,
    },
    log,
  );

  await clients.apps.patchNamespacedDeployment(
    { namespace, name, body: buildUpdateOps(input, nextResources) },
    setHeaderOptions("Content-Type", PatchStrategy.JsonPatch),
  );

  if (portChanged && input.port !== undefined) {
    await patchServiceTargetPort(clients.core, namespace, name, input.port);
  }

  const app = await getApp(clients, namespace, name);
  if (!app) throw new AppNotFoundError(name);
  return app;
}

/** Point the app's Service (port 80) at the new container port. A missing Service is ignored. */
async function patchServiceTargetPort(
  core: CoreV1Api,
  namespace: string,
  name: string,
  port: number,
): Promise<void> {
  try {
    await core.patchNamespacedService(
      { namespace, name, body: [{ op: "replace", path: "/spec/ports/0/targetPort", value: port }] },
      setHeaderOptions("Content-Type", PatchStrategy.JsonPatch),
    );
  } catch (err) {
    if (apiStatusCode(err) !== 404) throw err;
  }
}
