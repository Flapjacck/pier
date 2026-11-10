import type { VolumeHint } from "../types.js";
import { containerPath, underWorkdir } from "./merge.js";

/**
 * Hints from config files the repo already has (#83): docker compose volumes, fly.toml
 * mounts and Dockerfile VOLUME lines say outright where data lives, so they're high.
 * Parsed line by line on purpose: we only need mount targets, not a YAML/TOML parser.
 */

/** `- ./data:/app/data`, `- db:/var/lib/x:rw` or `target: /data` under a service's volumes. */
export function composeHints(text: string, file: string): VolumeHint[] {
  const hints: VolumeHint[] = [];
  let inVolumes = false;
  let indent = -1;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const lead = line.length - line.trimStart().length;
    if (/^\s+volumes:\s*$/.test(line)) {
      inVolumes = true;
      indent = lead;
      continue;
    }
    if (inVolumes && lead <= indent) inVolumes = false;
    if (!inVolumes) continue;
    const short = /^\s*-\s*["']?([^"'\s]+)["']?\s*$/.exec(line)?.[1];
    const target = short?.includes(":") ? short.split(":")[1] : /^\s*-?\s*target:\s*["']?([^"'\s]+)/.exec(line)?.[1];
    const path = target ? containerPath(target) : undefined;
    if (path) hints.push({ path, source: "compose", confidence: "high", reason: `${file} mounts a volume at ${path}.` });
  }
  return hints;
}

/** [mounts] / [[mounts]] destination = "/data" */
export function flyHints(text: string): VolumeHint[] {
  const hints: VolumeHint[] = [];
  let inMounts = false;
  for (const line of text.split("\n")) {
    const table = /^\s*\[{1,2}([^\]]+)\]{1,2}/.exec(line)?.[1];
    if (table) inMounts = table.trim() === "mounts";
    const dest = inMounts ? /^\s*destination\s*=\s*["']([^"']+)["']/.exec(line)?.[1] : undefined;
    const path = dest ? containerPath(dest) : undefined;
    if (path) hints.push({ path, source: "fly", confidence: "high", reason: `fly.toml mounts a volume at ${path}.` });
  }
  return hints;
}

/** VOLUME lines plus the last WORKDIR, so relative repo paths can be placed in the image. */
export function dockerfileInfo(text: string): { volumes: VolumeHint[]; workdir?: string } {
  const volumes: VolumeHint[] = [];
  let workdir: string | undefined;
  for (const line of text.split("\n")) {
    const wd = /^\s*WORKDIR\s+(\S+)/i.exec(line)?.[1];
    if (wd?.startsWith("/")) workdir = wd;
    const vol = /^\s*VOLUME\s+(.+)$/i.exec(line)?.[1];
    if (!vol) continue;
    const list = vol.trim().startsWith("[") ? (vol.match(/"([^"]+)"/g) ?? []).map((v) => v.slice(1, -1)) : vol.trim().split(/\s+/);
    for (const item of list) {
      const path = containerPath(item);
      if (path) volumes.push({ path, source: "image", confidence: "high", reason: `The Dockerfile declares VOLUME ${path}.` });
    }
  }
  return { volumes, ...(workdir ? { workdir } : {}) };
}

type DepRule = { file: string; pattern: RegExp; what: string; dir?: string };

/** Libraries that keep data in a local file. Matching is on the manifest text. */
const DEP_RULES: DepRule[] = [
  { file: "package.json", pattern: /"(better-sqlite3|sqlite3|sqlite|lowdb|nedb|@seald-io\/nedb|level|pouchdb-node)"\s*:/, what: "a file-based database" },
  { file: "requirements.txt", pattern: /^(aiosqlite|sqlite-utils|tinydb|sqlitedict|peewee)\b/im, what: "a file-based database" },
  { file: "pyproject.toml", pattern: /["'\s](aiosqlite|sqlite-utils|tinydb|sqlitedict)["'\s=<>~]/i, what: "a file-based database" },
  { file: "go.mod", pattern: /(mattn\/go-sqlite3|modernc\.org\/sqlite|glebarez\/sqlite|go\.etcd\.io\/bbolt)/, what: "SQLite or BoltDB" },
  { file: "Cargo.toml", pattern: /^\s*(rusqlite|sled|redb)\s*=/m, what: "an embedded database" },
  { file: "Gemfile", pattern: /gem\s+["']sqlite3["']/, what: "SQLite (Rails keeps it in storage/)", dir: "storage" },
  { file: "prisma/schema.prisma", pattern: /provider\s*=\s*["']sqlite["']/, what: "Prisma with SQLite", dir: "prisma" },
];

/** read is relative to the build folder and returns undefined for a missing file. */
export async function dependencyHints(read: (path: string) => Promise<string | undefined>, files: Set<string>, workdir: string): Promise<VolumeHint[]> {
  const hints: VolumeHint[] = [];
  for (const rule of DEP_RULES) {
    if (!files.has(rule.file)) continue;
    const text = await read(rule.file);
    const match = text ? rule.pattern.exec(text) : null;
    if (!match) continue;
    const lib = match[1];
    const path = underWorkdir(workdir, rule.dir ?? "data");
    if (!path) continue;
    hints.push({
      path,
      source: "dependency",
      confidence: "medium",
      reason: `${rule.file} uses ${lib && rule.what === "a file-based database" ? `${lib}, ${rule.what}` : rule.what}. Keep its file under ${path} and mount a volume there so data survives redeploys.`,
    });
  }
  return hints;
}

/**
 * A static site has nothing to persist: no hints at all. Railpack serves those with Caddy;
 * from the repo side, it's a build-only frontend with no server entry point.
 */
export function looksStatic(files: Set<string>, packageJson: string | undefined): boolean {
  const server = ["requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "Gemfile", "composer.json", "main.py", "app.py"];
  if (server.some((f) => files.has(f))) return false;
  if (!packageJson) return files.has("index.html");
  try {
    const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const frontend = ["vite", "react-scripts", "@angular/core", "parcel"].some((d) => d in deps);
    const serverDeps = ["express", "fastify", "koa", "hono", "next", "@remix-run/node", "@sveltejs/adapter-node", "nuxt"].some((d) => d in deps);
    return frontend && !serverDeps && !pkg.scripts?.start;
  } catch {
    return false;
  }
}
