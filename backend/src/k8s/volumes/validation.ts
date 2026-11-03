import { parseQuantity } from "../resources.js";
import type { VolumeMount } from "./types.js";

export const SIZE_PATTERN = "^[1-9][0-9]{0,4}(Mi|Gi)$";
const SIZE_RE = /^[1-9][0-9]{0,4}(Mi|Gi)$/;
const PATH_RE = /^\/[A-Za-z0-9._/-]+$/;

export function isValidMountPath(path: string): boolean {
  if (path.length > 255 || path === "/" || !PATH_RE.test(path) || path.includes("//") || path.endsWith("/")) return false;
  if (path.split("/").some((part) => part === "." || part === "..")) return false;
  return !["/proc", "/sys", "/dev", "/run/secrets"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function sizeProblem(size: string): string | undefined {
  if (!SIZE_RE.test(size)) return "size must be a whole Mi or Gi quantity";
  const bytes = parseQuantity(size);
  if (bytes === undefined || bytes < 100 * 2 ** 20 || bytes > 10 * 2 ** 30) return "size must be between 100Mi and 10Gi";
  return undefined;
}

export function mountProblems(mounts: VolumeMount[]): string | undefined {
  if (mounts.length > 3) return "at most 3 volumes are allowed";
  const names = new Set<string>();
  for (const mount of mounts) {
    if (names.has(mount.name)) return "volume names must be unique";
    names.add(mount.name);
    if (!isValidMountPath(mount.mountPath)) return `invalid mount path: ${mount.mountPath}`;
    if (mount.size !== undefined) {
      const problem = sizeProblem(mount.size);
      if (problem) return problem;
    }
  }
  for (let i = 0; i < mounts.length; i++) {
    for (let j = i + 1; j < mounts.length; j++) {
      const a = mounts[i].mountPath;
      const b = mounts[j].mountPath;
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return "mount paths must not overlap";
    }
  }
  return undefined;
}
