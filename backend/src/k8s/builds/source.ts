/** Validate and normalize Dockerfile build source fields (#83). */

export type BuildSource = {
  repo: string;
  branch: string;
  folder: string;
  dockerfile: string;
  gitCredential?: string;
};

const REPO_MAX = 512;
const BRANCH_MAX = 255;
const PATH_MAX = 255;
const NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** HTTPS or SSH git URLs only. */
const HTTPS_REPO = /^https:\/\/[a-z0-9._~:/?#[\]@!$&\'()*+,;=%-]+$/i;
const SSH_REPO = /^(?:git@[\w.-]+:[\w./-]+|ssh:\/\/git@[\w.@:/-]+)$/i;

function bad(detail: string): never {
  throw new InvalidBuildSourceError(detail);
}

export class InvalidBuildSourceError extends Error {
  readonly code = "invalid_build_source" as const;
  constructor(readonly details: string) {
    super(details);
    this.name = "InvalidBuildSourceError";
  }
}

function noDotDot(path: string, field: string): string {
  const trimmed = path.trim();
  if (!trimmed) bad(`${field} is required`);
  if (trimmed.length > PATH_MAX) bad(`${field} must be ≤${PATH_MAX} characters`);
  if (trimmed.startsWith("/") || trimmed.includes("\\")) bad(`${field} must be a relative path`);
  const parts = trimmed.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) {
    // Allow a lone "." for folder (repo root).
    if (!(field === "folder" && trimmed === ".")) bad(`${field} must not contain '.' or '..' segments`);
  }
  return trimmed;
}

export function normalizeBuildSource(input: {
  repo: string;
  branch?: string;
  folder?: string;
  dockerfile?: string;
  gitCredential?: string;
}): BuildSource {
  const repo = input.repo.trim();
  if (!repo) bad("repo is required");
  if (repo.length > REPO_MAX) bad(`repo must be ≤${REPO_MAX} characters`);
  if (!HTTPS_REPO.test(repo) && !SSH_REPO.test(repo)) {
    bad("repo must be an https:// or git@ SSH URL");
  }

  const branch = (input.branch?.trim() || "main");
  if (branch.length > BRANCH_MAX) bad(`branch must be ≤${BRANCH_MAX} characters`);
  if (/[\s\\]/.test(branch) || branch.includes("..")) bad("branch contains invalid characters");

  const folder = noDotDot(input.folder?.trim() || ".", "folder");
  const dockerfile = noDotDot(input.dockerfile?.trim() || "Dockerfile", "dockerfile");

  let gitCredential: string | undefined;
  if (input.gitCredential !== undefined && input.gitCredential.trim() !== "") {
    const name = input.gitCredential.trim();
    if (!NAME.test(name)) bad("gitCredential must be a DNS-1123 label");
    gitCredential = name;
  }

  return { repo, branch, folder, dockerfile, ...(gitCredential ? { gitCredential } : {}) };
}

/**
 * Absolute dir:// context for Kaniko after the clone initContainer writes
 * the repo under /workspace/src. Folder "." is the repo root.
 */
export function kanikoBuildContext(source: BuildSource): string {
  const root = "/workspace/src";
  if (source.folder === ".") return `dir://${root}`;
  return `dir://${root}/${source.folder}`;
}

/** Ensure HTTPS clone URLs end in .git; leave SSH scp-style as-is. */
export function cloneRepoUrl(source: BuildSource): string {
  let path = source.repo.trim();
  if (path.startsWith("git@")) return path.endsWith(".git") ? path : `${path}.git`;
  if (path.startsWith("ssh://git@")) {
    const m = /^ssh:\/\/git@([^/]+)\/(.+)$/i.exec(path);
    if (!m) bad("repo SSH URL is malformed");
    path = `git@${m[1]}:${m[2]}`;
    return path.endsWith(".git") ? path : `${path}.git`;
  }
  if (!path.startsWith("https://")) bad("repo must be an https:// or git@ SSH URL");
  return path.endsWith(".git") ? path : `${path}.git`;
}

export function builtImageRef(registry: string, app: string, tag: string): string {
  return `${registry}/${app}:${tag}`;
}
