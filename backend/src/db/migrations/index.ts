import type { DatabaseSync } from "node:sqlite";
import { migration001 } from "./001_init.js";

/**
 * A schema change. SQL lives in TypeScript (not .sql files) so tsup bundles it
 * into dist/index.js. Never edit a released migration; add a new one.
 */
export type Migration = { version: number; name: string; sql: string };

/** Every migration, in order. Versions must be unique and increasing. */
export const MIGRATIONS: readonly Migration[] = [migration001];

/**
 * Apply every migration newer than the recorded version. Each one runs in its own
 * transaction together with its schema_migrations row, so a failed migration leaves
 * nothing half-applied. Re-running is a no-op. Returns the versions applied now.
 */
export function runMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[] = MIGRATIONS,
  now: () => number = Date.now,
): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const done = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version)),
  );
  const insert = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  const applied: number[] = [];
  let last = 0;
  for (const migration of migrations) {
    if (migration.version <= last) {
      throw new Error(`migration ${migration.version} is out of order`);
    }
    last = migration.version;
    if (done.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      insert.run(migration.version, migration.name, now());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${migration.version} (${migration.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    applied.push(migration.version);
  }
  return applied;
}
