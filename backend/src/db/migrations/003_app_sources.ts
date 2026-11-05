import type { Migration } from "./index.js";

/**
 * 003: git build sources for apps (#83). Kubernetes remains the source of truth for
 * the running image; these rows remember how to rebuild.
 */
export const migration003: Migration = {
  version: 3,
  name: "app_sources",
  sql: `
    CREATE TABLE app_sources (
      app TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      folder TEXT NOT NULL DEFAULT '.',
      dockerfile TEXT NOT NULL DEFAULT 'Dockerfile',
      git_credential TEXT,
      last_commit TEXT,
      last_image TEXT,
      updated_at INTEGER NOT NULL
    );
  `,
};
