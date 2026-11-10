import type { VolumeHint } from "../types.js";
import { underWorkdir } from "./merge.js";

/**
 * Hints from what is committed (#83): database files and data-ish folders. Weak signals
 * on their own, so medium/low; a manifest or image VOLUME usually confirms them.
 */

const DB_FILE = /\.(db|sqlite|sqlite3)$/i;
const DATA_DIRS = new Set(["data", "storage", "uploads", "var"]);

/** files are repo-relative to the build folder. */
export function committedFileHints(files: string[], workdir: string): VolumeHint[] {
  const hints: VolumeHint[] = [];
  for (const file of files) {
    if (!DB_FILE.test(file) || file.split("/").some((p) => p === "node_modules" || p.startsWith("."))) continue;
    const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
    const path = underWorkdir(workdir, dir || "data");
    if (!path) continue;
    hints.push({
      path,
      source: "files",
      confidence: dir ? "medium" : "low",
      reason: dir
        ? `${file} is a database file committed to the repo; changes to it are lost on every deploy without a volume.`
        : `${file} is a database file at the repo root; move it into a folder like data/ and mount that.`,
    });
  }
  const topDirs = new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0] as string));
  for (const dir of topDirs) {
    if (!DATA_DIRS.has(dir.toLowerCase())) continue;
    const path = underWorkdir(workdir, dir);
    if (path) hints.push({ path, source: "files", confidence: "low", reason: `The repo has a ${dir}/ folder, which apps often write to at runtime.` });
  }
  return hints;
}
