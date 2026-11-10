import type { Migration } from "./index.js";

/**
 * 004: how an app is built and what to create once the first build finishes (#83).
 *
 * - build_method: 'railpack' or 'dockerfile'. Rows from before this migration were
 *   built from a Dockerfile, so that is the default and Redeploy keeps using it.
 * - pending_create: JSON runtime settings (port, replicas, host, env, resources,
 *   volumes) for an app whose first build has not succeeded yet, so Redeploy can
 *   retry it. Cleared as soon as the app exists in the cluster; from then on the
 *   Deployment is the source of truth. It can hold env values, which is why it is
 *   never returned by the API and is wiped on success and on delete.
 * - volume_hints: JSON list of suggested persistent paths (see src/builds/volume-hints).
 */
export const migration004: Migration = {
  version: 4,
  name: "app_sources_build",
  sql: `
    ALTER TABLE app_sources ADD COLUMN build_method TEXT NOT NULL DEFAULT 'dockerfile'
      CHECK (build_method IN ('railpack', 'dockerfile'));
    ALTER TABLE app_sources ADD COLUMN pending_create TEXT;
    ALTER TABLE app_sources ADD COLUMN volume_hints TEXT;
  `,
};
