import type { Migration } from "./index.js";

/** 001: audit log and login rate limiter (#80). */
export const migration001: Migration = {
  version: 1,
  name: "init",
  sql: `
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      ip TEXT NOT NULL,
      action TEXT NOT NULL,
      app TEXT,
      target TEXT,
      status INTEGER NOT NULL,
      details TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX audit_log_ts ON audit_log (ts);
    CREATE INDEX audit_log_app_id ON audit_log (app, id);

    CREATE TABLE login_attempts (
      ip TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
    CREATE INDEX login_attempts_reset_at ON login_attempts (reset_at);
  `,
};
