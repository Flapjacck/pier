import { isRecord } from "./guards";
import type { AppSource, GitCredential, GitProbeResult, VolumeHint } from "./sourceTypes";

const SOURCES = ["image", "compose", "fly", "dependency", "files"] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isHint(value: unknown): value is VolumeHint {
  return isRecord(value) && typeof value.path === "string" && typeof value.reason === "string" &&
    (SOURCES as readonly unknown[]).includes(value.source) && (CONFIDENCE as readonly unknown[]).includes(value.confidence);
}

/** Missing means "no hints" (older backends); a malformed list is a contract break. */
export function parseVolumeHints(value: unknown): VolumeHint[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isHint)) throw new SyntaxError("Invalid volume hints");
  return value.map((h) => ({ path: h.path, reason: h.reason, source: h.source, confidence: h.confidence }));
}

export function parseAppSource(json: unknown): AppSource {
  if (!isRecord(json) || (json.method !== "railpack" && json.method !== "dockerfile") ||
      typeof json.repo !== "string" || typeof json.branch !== "string" || typeof json.folder !== "string" ||
      typeof json.dockerfile !== "string") {
    throw new SyntaxError("Invalid app source");
  }
  const nullableString = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    method: json.method, repo: json.repo, branch: json.branch, folder: json.folder, dockerfile: json.dockerfile,
    ...(typeof json.gitCredential === "string" ? { gitCredential: json.gitCredential } : {}),
    lastCommit: nullableString(json.lastCommit), lastImage: nullableString(json.lastImage),
    volumeHints: parseVolumeHints(json.volumeHints),
  };
}

export function parseGitProbe(json: unknown): GitProbeResult {
  if (!isRecord(json) || typeof json.defaultBranch !== "string" || !isStringArray(json.branches) ||
      !isStringArray(json.folders) || !isStringArray(json.dockerfiles)) {
    throw new SyntaxError("Invalid git probe response");
  }
  return { defaultBranch: json.defaultBranch, branches: json.branches, folders: json.folders, dockerfiles: json.dockerfiles, volumeHints: parseVolumeHints(json.volumeHints) };
}

export function parseGitCredential(json: unknown): GitCredential {
  if (!isRecord(json) || typeof json.name !== "string" || typeof json.username !== "string" || typeof json.createdAt !== "string") {
    throw new SyntaxError("Invalid git credential");
  }
  return { name: json.name, username: json.username, createdAt: json.createdAt };
}

export function parseGitCredentialList(json: unknown): GitCredential[] {
  if (!isRecord(json) || !Array.isArray(json.credentials)) throw new SyntaxError("Invalid git credential list");
  return json.credentials.map(parseGitCredential);
}

export function parseRedeploy(json: unknown): { deploymentId: number } {
  if (!isRecord(json) || typeof json.deploymentId !== "number") throw new SyntaxError("Invalid redeploy response");
  return { deploymentId: json.deploymentId };
}
