/** Schemas and types for POST /apps route validation. */

export type PostAppsBody = {
  name: string;
  image: string;
  port: number;
  replicas?: number;
  host?: string;
  env?: Record<string, string>;
};

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
  },
  required: ["name", "image", "replicas", "ready", "status", "createdAt"],
} as const;

export const errorSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
  },
  required: ["ok", "error"],
} as const;

export const errorWithDetailsSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
    details: { type: "string" },
  },
  required: ["ok", "error"],
} as const;
