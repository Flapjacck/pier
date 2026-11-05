import type { AuditDetails } from "../db/audit.js";

/** What the audit hook can see of a finished request. */
export type AuditRequest = { params: unknown; query: unknown; body: unknown };

export type AuditRule = {
  action: string;
  /** App name the entry belongs to (null for volumes and login). */
  app: (req: AuditRequest) => string | null;
  /** Pod or volume name when that, not the app, is what was acted on. */
  target?: (req: AuditRequest) => string | null;
  /** Safe facts only: never env values, tokens or cookies. */
  details?: (req: AuditRequest) => AuditDetails;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Copy only scalar values of the named keys (never nested objects such as env). */
function pick(source: Record<string, unknown>, keys: string[]): AuditDetails {
  const out: AuditDetails = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Env key names only, sorted. The values can be secrets and are never stored. */
function envKeys(body: Record<string, unknown>): string[] | undefined {
  const env = body.env;
  return typeof env === "object" && env !== null ? Object.keys(env).sort() : undefined;
}

function volumeNames(body: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(body.volumes)) return undefined;
  return body.volumes.map((v) => str(record(v).name)).filter((n): n is string => n !== null);
}

function withLists(details: AuditDetails, lists: Record<string, string[] | undefined>): AuditDetails {
  for (const [key, list] of Object.entries(lists)) if (list !== undefined) details[key] = list;
  return details;
}

const paramName = (req: AuditRequest) => str(record(req.params).name);

function createDetails(req: AuditRequest): AuditDetails {
  const body = record(req.body);
  const details = withLists(pick(body, ["image", "port", "replicas", "host"]), { envKeys: envKeys(body), volumes: volumeNames(body) });
  const source = record(body.source);
  const repo = str(source.repo);
  if (repo) details.repo = repo;
  const branch = str(source.branch);
  if (branch) details.branch = branch;
  return details;
}

function patchDetails(req: AuditRequest): AuditDetails {
  const body = record(req.body);
  return withLists({}, { fields: Object.keys(body).sort(), envKeys: envKeys(body) });
}

/**
 * Every mutating API route, keyed by "METHOD /route/pattern". A test checks that no
 * POST/PATCH/PUT/DELETE route is missing from this map (logout is deliberately skipped).
 */
export const AUDITED_ROUTES: Record<string, AuditRule> = {
  "POST /api/apps": { action: "app.create", app: (req) => str(record(req.body).name), details: createDetails },
  "PATCH /api/apps/:name": { action: "app.update", app: paramName, details: patchDetails },
  "PATCH /api/apps/:name/scale": { action: "app.scale", app: paramName, details: (req) => pick(record(req.body), ["replicas"]) },
  "POST /api/apps/:name/restart": { action: "app.restart", app: paramName },
  "POST /api/apps/:name/redeploy": { action: "app.redeploy", app: paramName },
  "DELETE /api/apps/:name": {
    action: "app.delete",
    app: paramName,
    details: (req) => ({ deleteVolumes: record(req.query).deleteVolumes === true }),
  },
  "DELETE /api/apps/:name/pods/:pod": { action: "pod.delete", app: paramName, target: (req) => str(record(req.params).pod) },
  "POST /api/volumes": {
    action: "volume.create",
    app: () => null,
    target: (req) => str(record(req.body).name),
    details: (req) => pick(record(req.body), ["size"]),
  },
  "DELETE /api/volumes/:name": { action: "volume.delete", app: () => null, target: paramName },
  "POST /api/login": { action: "session.login", app: () => null },
  "POST /api/registries": { action: "registry.create", app: () => null, details: (req) => pick(record(req.body), ["name", "host"]) },
  "DELETE /api/registries/:name": { action: "registry.delete", app: () => null, target: paramName, details: (req) => ({ name: paramName(req) ?? "" }) },
  "PATCH /api/registries/:name": { action: "registry.update", app: () => null, target: paramName, details: (req) => ({ name: paramName(req) ?? "", ...pick(record(req.body), ["host"]) }) },
  "POST /api/registries/:name/test": { action: "registry.test", app: () => null, target: paramName },
  "POST /api/git-credentials": {
    action: "git_credential.create",
    app: () => null,
    details: (req) => pick(record(req.body), ["name", "username"]),
  },
  "PATCH /api/git-credentials/:name": {
    action: "git_credential.update",
    app: () => null,
    target: paramName,
    details: (req) => ({ name: paramName(req) ?? "", ...pick(record(req.body), ["username"]) }),
  },
  "DELETE /api/git-credentials/:name": {
    action: "git_credential.delete",
    app: () => null,
    target: paramName,
  },
};

/** Mutating routes that are intentionally not audited. */
export const UNAUDITED_ROUTES = new Set(["POST /api/logout", "POST /api/images/inspect", "POST /api/git/probe"]);
