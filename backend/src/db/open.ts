import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations/index.js";

/**
 * Open (or create) Pier's SQLite database and bring the schema up to date.
 * ":memory:" gives a throwaway DB for tests. WAL keeps reads from blocking the
 * single writer; SQLite puts the -wal and -shm files next to the DB file.
 */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}
