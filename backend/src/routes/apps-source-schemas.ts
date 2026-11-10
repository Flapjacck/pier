import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";
import type { BuildMethod, VolumeHint } from "../builds/types.js";

/** Schemas for building apps from git (#83): the POST /apps source body and the app's source. */

export type SourceBody = {
  method?: BuildMethod;
  repo: string;
  branch?: string;
  folder?: string;
  dockerfile?: string;
  gitCredential?: string;
};

/** What an app response says about its source. Never carries a token, only the credential name. */
export type AppSourceSummary = {
  method: BuildMethod;
  repo: string;
  branch: string;
  folder: string;
  dockerfile: string;
  gitCredential?: string;
  lastCommit: string | null;
  lastImage: string | null;
  volumeHints: VolumeHint[];
};

export const sourceBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["repo"],
  properties: {
    method: { type: "string", enum: ["railpack", "dockerfile"], default: "railpack" },
    repo: { type: "string", minLength: 1, maxLength: 512 },
    branch: { type: "string", minLength: 1, maxLength: 255 },
    folder: { type: "string", minLength: 1, maxLength: 255 },
    dockerfile: { type: "string", minLength: 1, maxLength: 255 },
    gitCredential: { type: "string", minLength: 1, maxLength: 63, pattern: APP_NAME_SCHEMA_PATTERN },
  },
} as const;

export const volumeHintSchema = {
  type: "object",
  properties: {
    path: { type: "string" },
    reason: { type: "string" },
    source: { type: "string", enum: ["image", "compose", "fly", "dependency", "files"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["path", "reason", "source", "confidence"],
} as const;

export const appSourceSchema = {
  type: "object",
  properties: {
    method: { type: "string", enum: ["railpack", "dockerfile"] },
    repo: { type: "string" },
    branch: { type: "string" },
    folder: { type: "string" },
    dockerfile: { type: "string" },
    gitCredential: { type: "string" },
    lastCommit: { type: ["string", "null"] },
    lastImage: { type: ["string", "null"] },
    volumeHints: { type: "array", items: volumeHintSchema },
  },
  required: ["method", "repo", "branch", "folder", "dockerfile", "lastCommit", "lastImage", "volumeHints"],
} as const;
