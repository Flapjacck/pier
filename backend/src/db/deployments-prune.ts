import type { DatabaseSync } from "node:sqlite";

/** Finished deploys kept per app, newest first, regardless of age. */
export const DEPLOYS_KEPT_PER_APP = 50;

export type PruneDeploymentsOptions = { before: number; keepPerApp?: number };

/**
 * Delete finished deploys older than `before` (epoch ms) and, per app, every finished
 * deploy beyond the newest `keepPerApp`. Running deploys are never pruned. Steps and
 * lines go with their deploy (ON DELETE CASCADE). Returns the number of deploys deleted.
 */
export function pruneDeployments(db: DatabaseSync, opts: PruneDeploymentsOptions): number {
  const keep = opts.keepPerApp ?? DEPLOYS_KEPT_PER_APP;
  const old = db.prepare("DELETE FROM deployments WHERE status <> 'running' AND finished_at < ?").run(opts.before);
  const extra = db
    .prepare(
      `DELETE FROM deployments WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY app ORDER BY id DESC) AS n
           FROM deployments WHERE status <> 'running'
         ) WHERE n > ?
       )`,
    )
    .run(keep);
  return Number(old.changes) + Number(extra.changes);
}
