import type { BuildMethod, BuildSource } from "./types.js";

/** Validate and normalize a build source from the API (#83). */

const REPO_MAX = 512;
const BRANCH_MAX = 255;
const PATH_MAX = 255;
const NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const HTTPS_REPO = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?\/[\w.~/-]+$/i;
const SCP_REPO = /^git@([a-z0-9.-]+):([\w.~/-]+)$/i;
const SSH_REPO = /^ssh:\/\/git@([a-z0-9.-]+)\/([\w.~/-]+)$/i;

export class InvalidBuildSourceError extends Error {
  readonly code = "invalid_build_source" as const;
  constructor(readonly details: string) {
    super(details);
    this.name = "InvalidBuildSourceError";
  }
}

function bad(detail: string): never {
  throw new InvalidBuildSourceError(detail);
}

/** A relative path with no "." or ".." segments ("." alone means the repo root). */
function relativePath(raw: string | undefined, field: string, fallback: string, allowRoot: boolean): string {
  const value = raw?.trim() || fallback;
  if (value.length > PATH_MAX) bad(`${field} must be at most ${PATH_MAX} characters`);
  if (allowRoot && value === ".") return value;
  if (value.startsWith("/") || value.includes("\\")) bad(`${field} must be a relative path`);
  const parts = value.replace(/\/+$/, "").split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) bad(`${field} must not contain empty, '.' or '..' segments`);
  if (!/^[\w./ @+-]+$/.test(value)) bad(`${field} contains unsupported characters`);
  return parts.join("/");
}

/** Builds clone over HTTPS only (tokens come from git credentials), so SSH forms are rewritten. */
export function cloneUrl(repo: string): string {
  const scp = SCP_REPO.exec(repo) ?? SSH_REPO.exec(repo);
  const url = scp ? `https://${scp[1]}/${scp[2]}` : repo;
  return url.endsWith(".git") ? url : `${url.replace(/\/+$/, "")}.git`;
}

export function normalizeBuildSource(input: {
  method?: BuildMethod;
  repo: string;
  branch?: string;
  folder?: string;
  dockerfile?: string;
  gitCredential?: string | null;
}): BuildSource {
  const repo = input.repo.trim();
  if (!repo) bad("repo is required");
  if (repo.length > REPO_MAX) bad(`repo must be at most ${REPO_MAX} characters`);
  // No userinfo: a token pasted into the URL would end up in logs and the database.
  if (!HTTPS_REPO.test(repo) && !SCP_REPO.test(repo) && !SSH_REPO.test(repo)) {
    bad("repo must be an https:// URL (without a username or token) or a git@host:owner/repo SSH address");
  }

  const branch = input.branch?.trim() || "main";
  if (branch.length > BRANCH_MAX) bad(`branch must be at most ${BRANCH_MAX} characters`);
  if (!/^[\w./-]+$/.test(branch) || branch.startsWith("-") || branch.includes("..") || branch.endsWith(".lock")) {
    bad("branch contains invalid characters");
  }

  const method = input.method ?? "railpack";
  const folder = relativePath(input.folder, "folder", ".", true);
  const dockerfile = relativePath(input.dockerfile, "dockerfile", "Dockerfile", false);

  const credential = input.gitCredential?.trim();
  if (credential && !NAME.test(credential)) bad("gitCredential must be a DNS-1123 label");

  return { method, repo, branch, folder, dockerfile, ...(credential ? { gitCredential: credential } : {}) };
}

/** Image ref for one build: <registry>/<app>:<tag>. */
export function builtImageRef(registry: string, app: string, tag: string): string {
  return `${registry}/${app}:${tag}`;
}
