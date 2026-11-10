import { apiErrorMessage, apiStatusCode } from "../../k8s/api-errors.js";
import type { App } from "../../k8s/apps.js";
import { AppExistsError, CreateTimeoutError, HostInUseError } from "../../k8s/create-app.js";
import { QuotaExceededError, ResourceLimitError } from "../../k8s/resource-fit.js";
import { AppNotFoundError, InvalidResourcesError } from "../../k8s/update-app.js";
import {
  InvalidVolumesError,
  VolumeNotFoundError,
  VolumeQuotaExceededError,
  VolumesReplicaError,
} from "../../k8s/volumes/errors.js";
import type { DeployHandle } from "../../deploys/tracker.js";
import type { DeploySpec } from "../../deploys/types.js";
import type { PatchAppBody, PostAppsBody } from "../apps-schemas.js";

/** Snapshot of what a deploy asked for. Env values can be secrets: only key names are kept. */
function envKeys(env: Record<string, string> | undefined): string[] | undefined {
  return env ? Object.keys(env).sort() : undefined;
}

function volumes(list: { name: string; mountPath: string }[] | undefined): DeploySpec["volumes"] {
  return list?.map((v) => ({ name: v.name, mountPath: v.mountPath }));
}

type Pair = { cpu?: string; memory?: string } | undefined;

function pair(p: Pair): Record<string, string> | undefined {
  if (!p) return undefined;
  const out: Record<string, string> = {};
  if (p.cpu !== undefined) out.cpu = p.cpu;
  if (p.memory !== undefined) out.memory = p.memory;
  return out;
}

function resources(r: { requests?: Pair; limits?: Pair } | undefined): DeploySpec["resources"] {
  if (!r) return undefined;
  const requests = pair(r.requests);
  const limits = pair(r.limits);
  return { ...(requests && { requests }), ...(limits && { limits }) };
}

function defined(spec: DeploySpec): DeploySpec {
  return Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as DeploySpec;
}

export function specFromCreateBody(body: PostAppsBody): DeploySpec {
  return defined({
    image: body.image,
    port: body.port,
    replicas: body.replicas,
    host: body.host?.toLowerCase(),
    resources: resources(body.resources),
    volumes: volumes(body.volumes),
    envKeys: envKeys(body.env),
    registry: body.registry,
  });
}

export function specFromPatch(body: PatchAppBody): DeploySpec {
  return defined({
    image: body.image,
    port: body.port,
    replicas: body.replicas,
    resources: resources(body.resources),
    volumes: volumes(body.volumes),
    envKeys: envKeys(body.env),
    registry: body.registry,
  });
}

export function specFromApp(app: App): DeploySpec {
  return defined({
    image: app.image,
    port: app.port,
    replicas: app.replicas,
    host: app.host,
    resources: resources(app.resources),
    volumes: volumes(app.volumes),
    envKeys: envKeys(app.env) ?? [],
    registry: app.registry,
  });
}

const VALIDATION_ERRORS = [
  InvalidResourcesError,
  ResourceLimitError,
  QuotaExceededError,
  InvalidVolumesError,
  VolumesReplicaError,
  VolumeNotFoundError,
  VolumeQuotaExceededError,
  HostInUseError,
];

/** Plain reason for a change the cluster did not accept. */
function applyReason(err: unknown): string {
  if (err instanceof CreateTimeoutError) return "Creating the app timed out. Try again.";
  const status = apiStatusCode(err);
  const message = apiErrorMessage(err) ?? (err instanceof Error ? err.message : undefined);
  if (status === 403 && message?.toLowerCase().includes("exceeded quota")) return `The namespace quota is full: ${message}`;
  if (status === 403) return `The cluster refused the change: ${message ?? "forbidden"}`;
  if (status === 400 || status === 422) return `The cluster rejected the change: ${message ?? "invalid"}`;
  return "Could not reach the cluster to apply the change.";
}

/** Reason for a failed Apply after a build (#83): validation messages as-is, else the cluster's. */
export function applyFailureReason(err: unknown): string {
  if (VALIDATION_ERRORS.some((type) => err instanceof type) || err instanceof AppExistsError || err instanceof AppNotFoundError) {
    return err instanceof Error ? err.message : "The change is not valid.";
  }
  return applyReason(err);
}

/**
 * Record why a create/PATCH/restart failed: "not this app" errors (409 exists, 404)
 * drop the record; validation errors fail Validate; everything else fails Apply resources.
 */
export function recordDeployError(handle: DeployHandle | null, err: unknown): void {
  if (!handle) return;
  if (err instanceof AppExistsError || err instanceof AppNotFoundError || apiStatusCode(err) === 409 || isNotFound(err)) {
    handle.discard();
    return;
  }
  if (VALIDATION_ERRORS.some((type) => err instanceof type)) {
    handle.fail("validate", err instanceof Error ? err.message : "The change is not valid.");
    return;
  }
  handle.stepSucceeded("validate");
  handle.fail("apply", applyReason(err));
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message === "app not found";
}

/** Add `deploymentId` to a response body when the deploy was recorded. */
export function withDeploymentId<T extends object>(body: T, handle: DeployHandle | null): T & { deploymentId?: number } {
  return handle ? { ...body, deploymentId: handle.id } : body;
}
