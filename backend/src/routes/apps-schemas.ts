import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";

/** Schemas and types for POST /apps route validation. */

export type PostAppsBody = {
  name: string;
  image: string;
  port: number;
  replicas: number;
  host?: string;
  env?: Record<string, string>;
};

export const postAppsBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      pattern: APP_NAME_SCHEMA_PATTERN,
    },
    image: {
      type: "string",
      minLength: 1,
      maxLength: 255,
      pattern: "^\\S+$",
    },
    port: {
      type: "integer",
      minimum: 1,
      maximum: 65535,
    },
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
    env: {
      type: "object",
      maxProperties: 50,
      propertyNames: {
        pattern: "^[A-Za-z_][A-Za-z0-9_]*$",
      },
      additionalProperties: {
        type: "string",
        maxLength: 4096,
      },
    },
  },
  required: ["name", "image", "port"],
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
