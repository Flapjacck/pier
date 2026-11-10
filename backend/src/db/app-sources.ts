import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { BuildMethod, BuildSource, VolumeHint } from "../builds/types.js";

/**
 * Git build sources (#83), one row per app. A row exists from the moment a build-from-
 * repo app is created, so an app whose first build failed still has a page.
 */

/** Runtime settings to create the app with once its first build succeeds. */
export type PendingCreate = {
  port: number;
  replicas: number;
  host?: string;
  env?: Record<string, string>;
  resources?: { requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } };
  volumes?: { name: string; mountPath: string; size?: string }[];
};

export type AppSource = BuildSource & {
  app: string;
  lastCommit: string | null;
  lastImage: string | null;
  /** Set until the app exists in the cluster. Can contain env values: never serialize it. */
  pendingCreate: PendingCreate | null;
  volumeHints: VolumeHint[];
  updatedAt: number;
};

export type AppSourceInput = BuildSource & {
  app: string;
  pendingCreate?: PendingCreate | null;
  updatedAt: number;
};

function text(value: SQLOutputValue): string | null {
  return typeof value === "string" ? value : null;
}

function json<T>(value: SQLOutputValue, fallback: T): T {
  const raw = text(value);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toSource(row: Record<string, SQLOutputValue>): AppSource {
  const credential = text(row.git_credential);
  return {
    app: String(row.app),
    method: row.build_method === "railpack" ? "railpack" : "dockerfile",
    repo: String(row.repo),
    branch: String(row.branch),
    folder: String(row.folder),
    dockerfile: String(row.dockerfile),
    ...(credential ? { gitCredential: credential } : {}),
    lastCommit: text(row.last_commit),
    lastImage: text(row.last_image),
    pendingCreate: json<PendingCreate | null>(row.pending_create, null),
    volumeHints: json<VolumeHint[]>(row.volume_hints, []),
    updatedAt: Number(row.updated_at),
  };
}

/** Insert or replace an app's source. Keeps the last build result and hints. */
export function upsertAppSource(db: DatabaseSync, input: AppSourceInput): void {
  db.prepare(
    `INSERT INTO app_sources (app, build_method, repo, branch, folder, dockerfile, git_credential, pending_create, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(app) DO UPDATE SET
       build_method = excluded.build_method, repo = excluded.repo, branch = excluded.branch,
       folder = excluded.folder, dockerfile = excluded.dockerfile, git_credential = excluded.git_credential,
       pending_create = excluded.pending_create, updated_at = excluded.updated_at`,
  ).run(
    input.app,
    input.method,
    input.repo,
    input.branch,
    input.folder,
    input.dockerfile,
    input.gitCredential ?? null,
    input.pendingCreate ? JSON.stringify(input.pendingCreate) : null,
    input.updatedAt,
  );
}

export function getAppSource(db: DatabaseSync, app: string): AppSource | undefined {
  const row = db.prepare("SELECT * FROM app_sources WHERE app = ?").get(app);
  return row ? toSource(row) : undefined;
}

export function listAppSources(db: DatabaseSync): AppSource[] {
  return db.prepare("SELECT * FROM app_sources ORDER BY app").all().map(toSource);
}

export function deleteAppSource(db: DatabaseSync, app: string): boolean {
  return Number(db.prepare("DELETE FROM app_sources WHERE app = ?").run(app).changes) > 0;
}

/** Record a successful build: the pushed image, its commit and fresh volume hints. */
export function setBuildResult(
  db: DatabaseSync,
  app: string,
  result: { commit: string | null; image: string; volumeHints: VolumeHint[]; now: number },
): void {
  db.prepare("UPDATE app_sources SET last_commit = ?, last_image = ?, volume_hints = ?, updated_at = ? WHERE app = ?").run(
    result.commit,
    result.image,
    JSON.stringify(result.volumeHints),
    result.now,
    app,
  );
}

/** The app now exists in the cluster: forget the pending settings (and their env values). */
export function clearPendingCreate(db: DatabaseSync, app: string, now: number): void {
  db.prepare("UPDATE app_sources SET pending_create = NULL, updated_at = ? WHERE app = ?").run(now, app);
}

export function setVolumeHints(db: DatabaseSync, app: string, hints: VolumeHint[]): void {
  db.prepare("UPDATE app_sources SET volume_hints = ? WHERE app = ?").run(JSON.stringify(hints), app);
}

/** Apps whose source uses this git credential (blocks deleting it). */
export function appsUsingCredential(db: DatabaseSync, credential: string): string[] {
  return db
    .prepare("SELECT app FROM app_sources WHERE git_credential = ? ORDER BY app")
    .all(credential)
    .map((row) => String(row.app));
}

export function isBuildMethod(value: unknown): value is BuildMethod {
  return value === "railpack" || value === "dockerfile";
}
