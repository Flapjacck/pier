import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";
import { SIZE_PATTERN } from "../k8s/volumes/validation.js";

export type VolumeBody = { name: string; size: string };
export const volumeBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "size"],
  properties: {
    name: { type: "string", pattern: APP_NAME_SCHEMA_PATTERN },
    size: { type: "string", pattern: SIZE_PATTERN },
  },
} as const;
export const volumeSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    size: { type: "string" },
    status: { type: "string", enum: ["pending", "bound", "lost"] },
    app: { type: "string" },
    mountPath: { type: "string" },
    createdAt: { type: "string" },
  },
  required: ["name", "size", "status", "createdAt"],
} as const;
