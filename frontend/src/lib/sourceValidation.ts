/**
 * Client-side mirror of backend/src/builds/source.ts (#83): catch a bad repo URL or
 * path on the step where it was typed instead of after Deploy.
 */

const HTTPS_REPO = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?\/[\w.~/-]+$/i;
const SSH_REPO = /^(?:git@[a-z0-9.-]+:|ssh:\/\/git@[a-z0-9.-]+\/)[\w.~/-]+$/i;

export function repoError(raw: string): string | undefined {
  const repo = raw.trim();
  if (!repo) return "Repository URL is required";
  if (repo.length > 512) return "Repository URL must be ≤512 characters";
  // A token pasted into the URL would be stored and shown; credentials go in Git credentials.
  if (/^https:\/\/[^/]*@/i.test(repo)) return "Don't put a username or token in the URL; add a git credential instead";
  if (!HTTPS_REPO.test(repo) && !SSH_REPO.test(repo)) return "Use an https:// URL or a git@host:owner/repo address";
  return undefined;
}

/** "." (root) is allowed for folders only; no absolute paths or "." / ".." segments. */
export function repoPathError(raw: string, field: "Folder" | "Dockerfile"): string | undefined {
  const value = raw.trim();
  if (!value) return `${field} is required`;
  if (value.length > 255) return `${field} must be ≤255 characters`;
  if (field === "Folder" && value === ".") return undefined;
  if (value.startsWith("/") || value.includes("\\")) return `${field} must be a path inside the repo`;
  const parts = value.replace(/\/+$/, "").split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return `${field} can't contain empty, '.' or '..' parts`;
  if (!/^[\w./ @+-]+$/.test(value)) return `${field} contains unsupported characters`;
  return undefined;
}
