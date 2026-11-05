/**
 * Settings tab "Configuration" form: turn edited values into a PATCH /api/apps/:name body
 * that carries only the fields that changed. Mirrors the backend PatchAppBody rules.
 */
import type { App, AppResources, UpdateAppBody } from "../api/types";
import { imageError, portError } from "./deployValidation";
import { envToRows, sameEnv, validateEnvRows, type EnvRowValue } from "./envValidation";
import {
  DEFAULT_RESOURCES,
  sameResources,
  trimResources,
  validateResources,
  type ResourceErrors,
} from "./resources";

export type AppConfigValues = {
  image: string;
  port: string;
  env: EnvRowValue[];
  resources: AppResources;
  registry: string;
};

export type AppConfigErrors = {
  image?: string;
  port?: string;
  /** Keyed by env row id ("" for the whole list). */
  env?: Record<string, string>;
  resources?: ResourceErrors;
};

export type AppConfigResult =
  | { ok: true; body: UpdateAppBody; changed: boolean }
  | { ok: false; errors: AppConfigErrors };

/** Older backends don't send resources; they always applied the defaults. */
export function appResources(app: App): AppResources {
  return app.resources ?? DEFAULT_RESOURCES;
}

export function configValuesFromApp(app: App): AppConfigValues {
  return {
    image: app.image,
    port: app.port !== undefined ? String(app.port) : "",
    env: envToRows(app.env),
    resources: appResources(app),
    registry: app.registry ?? "",
  };
}

/** Validate the form and diff it against the live app. */
export function buildUpdateBody(app: App, values: AppConfigValues): AppConfigResult {
  const errors: AppConfigErrors = {};
  const image = values.image.trim();
  const port = values.port.trim();
  const resources = trimResources(values.resources);

  const imageMsg = imageError(image);
  if (imageMsg) errors.image = imageMsg;
  const portMsg = portError(port);
  if (portMsg) errors.port = portMsg;
  const { env, errors: envErrors } = validateEnvRows(values.env);
  if (Object.keys(envErrors).length > 0) errors.env = envErrors;
  const resourceErrors = validateResources(resources);
  if (Object.keys(resourceErrors).length > 0) errors.resources = resourceErrors;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const body: UpdateAppBody = {};
  if (image !== app.image) body.image = image;
  if (Number(port) !== app.port) body.port = Number(port);
  if (!sameEnv(env, app.env ?? {})) body.env = env;
  if (!sameResources(resources, appResources(app))) body.resources = resources;
  if (values.registry !== (app.registry ?? "")) body.registry = values.registry || "";
  return { ok: true, body, changed: Object.keys(body).length > 0 };
}

/** Short list of what will change, for the confirm dialog. */
export function describeChanges(body: UpdateAppBody): string {
  const parts: string[] = [];
  if (body.image !== undefined) parts.push(`image → ${body.image}`);
  if (body.port !== undefined) parts.push(`port → ${body.port}`);
  if (body.env !== undefined) parts.push(`${Object.keys(body.env).length} env var(s)`);
  if (body.resources !== undefined) parts.push("CPU & memory");
  if (body.registry !== undefined) parts.push(body.registry ? `registry → ${body.registry}` : "anonymous registry");
  return parts.join(", ");
}
