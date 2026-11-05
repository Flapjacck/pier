import type { DatabaseSync } from "node:sqlite";

export type AppSource = {
  app: string;
  repo: string;
  branch: string;
  folder: string;
  dockerfile: string;
  gitCredential: string | null;
  lastCommit: string | null;
  lastImage: string | null;
  updatedAt: number;
};

export type AppSourceInput = {
  app: string;
  repo: string;
  branch: string;
  folder: string;
  dockerfile: string;
  gitCredential?: string | null;
  lastCommit?: string | null;
  lastImage?: string | null;
  updatedAt: number;
};

function rowToSource(row: Record<string, unknown>): AppSource {
  return {
    app: String(row.app),
    repo: String(row.repo),
    branch: String(row.branch),
    folder: String(row.folder),
    dockerfile: String(row.dockerfile),
    gitCredential: row.git_credential == null ? null : String(row.git_credential),
    lastCommit: row.last_commit == null ? null : String(row.last_commit),
    lastImage: row.last_image == null ? null : String(row.last_image),
    updatedAt: Number(row.updated_at),
  };
}

export function upsertAppSource(db: DatabaseSync, input: AppSourceInput): void {
  db.prepare(
    `INSERT INTO app_sources (app, repo, branch, folder, dockerfile, git_credential, last_commit, last_image, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(app) DO UPDATE SET
       repo = excluded.repo,
       branch = excluded.branch,
       folder = excluded.folder,
       dockerfile = excluded.dockerfile,
       git_credential = excluded.git_credential,
       last_commit = excluded.last_commit,
       last_image = excluded.last_image,
       updated_at = excluded.updated_at`,
  ).run(
    input.app,
    input.repo,
    input.branch,
    input.folder,
    input.dockerfile,
    input.gitCredential ?? null,
    input.lastCommit ?? null,
    input.lastImage ?? null,
    input.updatedAt,
  );
}

export function getAppSource(db: DatabaseSync, app: string): AppSource | undefined {
  const row = db.prepare("SELECT * FROM app_sources WHERE app = ?").get(app);
  return row ? rowToSource(row as Record<string, unknown>) : undefined;
}

export function deleteAppSource(db: DatabaseSync, app: string): void {
  db.prepare("DELETE FROM app_sources WHERE app = ?").run(app);
}

export function setAppSourceBuildResult(
  db: DatabaseSync,
  app: string,
  result: { lastCommit: string; lastImage: string; updatedAt: number },
): void {
  db.prepare(
    "UPDATE app_sources SET last_commit = ?, last_image = ?, updated_at = ? WHERE app = ?",
  ).run(result.lastCommit, result.lastImage, result.updatedAt, app);
}
