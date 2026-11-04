import type { Migration } from "./index.js";

/**
 * 002: deploy records, their steps and output lines (#81). Kubernetes stays the source of
 * truth for live app state; these rows only record what each deploy did and why it failed.
 */
export const migration002: Migration = {
  version: 2,
  name: "deployments",
  sql: `
    CREATE TABLE deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app TEXT NOT NULL,
      trigger TEXT NOT NULL CHECK (trigger IN ('create','patch','restart','rollback','build')),
      status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','cancelled')),
      spec TEXT NOT NULL DEFAULT '{}',
      reason TEXT,
      generation INTEGER,
      source_deployment_id INTEGER REFERENCES deployments(id) ON DELETE SET NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX deployments_app_id ON deployments (app, id);
    CREATE INDEX deployments_status ON deployments (status);
    CREATE TABLE deployment_steps (
      deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','skipped')),
      started_at INTEGER,
      finished_at INTEGER,
      PRIMARY KEY (deployment_id, position)
    );
    CREATE TABLE deployment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      step TEXT NOT NULL,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('info','warning','error')),
      text TEXT NOT NULL,
      event_key TEXT
    );
    CREATE INDEX deployment_logs_deploy ON deployment_logs (deployment_id, id);
    CREATE UNIQUE INDEX deployment_logs_event ON deployment_logs (deployment_id, event_key) WHERE event_key IS NOT NULL;
  `,
};
