import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";
import type { PartialAppResources } from "../k8s/resources.js";
import { SIZE_PATTERN } from "../k8s/volumes/validation.js";
import { appSourceSchema, sourceBodySchema, type AppSourceSummary, type SourceBody } from "./apps-source-schemas.js";

/** Schemas and types for the /apps routes (POST /apps, PATCH /apps/:name, responses). */

export type PostAppsBody = {
  name: string;
  /** Exactly one of image (pre-built) and source (build from git, #83). */
  image?: string;
  port: number;
  replicas: number;
  host?: string;
  env?: Record<string, string>;
  resources?: PartialAppResources;
  volumes?: { name: string; mountPath: string; size?: string }[];
  registry?: string;
  source?: SourceBody;
};

/** PATCH /apps/:name body: at least one field; env replaces the whole set. */
export type PatchAppBody = {
  image?: string;
  port?: number;
  replicas?: number;
  env?: Record<string, string>;
  resources?: PartialAppResources;
  volumes?: { name: string; mountPath: string; size?: string }[];
  registry?: string | null;
};

/** Millicores ("250m", 1m–9999m) or cores ("1", "0.5", up to 3 decimals). */
export const CPU_QUANTITY_PATTERN = "^(?:[1-9][0-9]{0,3}m|[0-9]{1,2}(?:\\.[0-9]{1,3})?)$";

/** Whole Mi or Gi ("256Mi", "1Gi"). */
export const MEMORY_QUANTITY_PATTERN = "^[1-9][0-9]{0,5}(?:Mi|Gi)$";

const resourcePairSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    cpu: { type: "string", pattern: CPU_QUANTITY_PATTERN },
    memory: { type: "string", pattern: MEMORY_QUANTITY_PATTERN },
  },
} as const;

/** Partial requests/limits; missing fields come from the defaults (POST) or the app (PATCH). */
export const resourcesBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { requests: resourcePairSchema, limits: resourcePairSchema },
} as const;

const imageSchema = { type: "string", minLength: 1, maxLength: 255, pattern: "^\\S+$" } as const;
const portSchema = { type: "integer", minimum: 1, maximum: 65535 } as const;
const envSchema = {
  type: "object",
  maxProperties: 50,
  propertyNames: { pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
  additionalProperties: { type: "string", maxLength: 4096 },
} as const;
export const volumeMountSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "mountPath"],
  properties: {
    name: { type: "string", pattern: APP_NAME_SCHEMA_PATTERN },
    mountPath: { type: "string", minLength: 1, maxLength: 255 },
    size: { type: "string", pattern: SIZE_PATTERN },
  },
} as const;
export const volumesSchema = { type: "array", maxItems: 3, items: volumeMountSchema } as const;

export const patchAppBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    image: imageSchema,
    port: portSchema,
    replicas: { type: "integer", minimum: 0, maximum: 10 },
    env: envSchema,
    resources: resourcesBodySchema,
    volumes: volumesSchema,
    registry: { type: ["string", "null"], minLength: 1, maxLength: 63, pattern: APP_NAME_SCHEMA_PATTERN },
  },
} as const;

export const postAppsBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      pattern: APP_NAME_SCHEMA_PATTERN,
    },
    image: imageSchema,
    port: portSchema,
    replicas: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      default: 1,
    },
    host: {
      type: "string",
      minLength: 1,
      maxLength: 253,
    },
    env: envSchema,
    resources: resourcesBodySchema,
    volumes: volumesSchema,
    registry: { type: ["string", "null"], minLength: 1, maxLength: 63, pattern: APP_NAME_SCHEMA_PATTERN },
    source: sourceBodySchema,
  },
  required: ["name", "port"],
  // image XOR source is checked in the route: a oneOf here gives unreadable 400 details.
} as const;

const resourcePairResponse = {
  type: "object",
  properties: { cpu: { type: "string" }, memory: { type: "string" } },
} as const;

export const appSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    image: { type: "string" },
    replicas: { type: "number" },
    ready: { type: "number" },
    status: {
      type: "string",
      enum: ["running", "stopped", "building", "failed"],
    },
    createdAt: { type: "string" },
    port: { type: "integer" },
    host: { type: "string" },
    url: { type: "string" },
    env: { type: "object", additionalProperties: { type: "string" } },
    resources: {
      type: "object",
      properties: {
        requests: resourcePairResponse,
        limits: resourcePairResponse,
      },
    },
    volumes: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, mountPath: { type: "string" } },
        required: ["name", "mountPath"],
      },
    },
    registry: { type: "string" },
    deploymentId: { type: "integer", description: "Deploy record started by this request (#81)" },
    source: appSourceSchema,
  },
  required: ["name", "image", "replicas", "ready", "status", "createdAt"],
} as const;

export const errorSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
    details: { type: "string" },
  },
  required: ["ok", "error"],
} as const;

export type { AppSourceSummary };
