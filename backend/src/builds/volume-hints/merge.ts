import type { VolumeHint, VolumeHintConfidence } from "../types.js";

/** Shared helpers for the volume hint detectors (#83 items 21–23). */

const RANK: Record<VolumeHintConfidence, number> = { low: 0, medium: 1, high: 2 };

/** Normalize a container path: absolute, no trailing slash, no "..". Undefined when unusable. */
export function containerPath(path: string): string | undefined {
  const trimmed = path.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (!trimmed.startsWith("/") || trimmed === "" || trimmed.split("/").includes("..")) return undefined;
  if (/^\/(proc|sys|dev|etc|bin|sbin|usr|lib|tmp|run|var\/run)(\/|$)/.test(trimmed)) return undefined;
  return trimmed.replace(/\/{2,}/g, "/");
}

/** Join an in-repo directory (relative to the build folder) onto the app's working dir. */
export function underWorkdir(workdir: string, relDir: string): string | undefined {
  const rel = relDir.replace(/^\.\/?/, "").replace(/\/+$/, "");
  return containerPath(rel ? `${workdir.replace(/\/+$/, "")}/${rel}` : workdir);
}

/** One hint per path: the most confident one wins and the other reasons are kept. */
export function mergeHints(hints: VolumeHint[]): VolumeHint[] {
  const byPath = new Map<string, VolumeHint>();
  for (const hint of hints) {
    const seen = byPath.get(hint.path);
    if (!seen) {
      byPath.set(hint.path, { ...hint });
      continue;
    }
    const [best, other] = RANK[hint.confidence] > RANK[seen.confidence] ? [hint, seen] : [seen, hint];
    const reasons = best.reason.includes(other.reason) ? best.reason : `${best.reason} ${other.reason}`;
    byPath.set(hint.path, { ...best, reason: reasons });
  }
  return [...byPath.values()].sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || a.path.localeCompare(b.path)).slice(0, 10);
}
