import type { DatabaseSync } from "node:sqlite";
import { pruneAudit } from "./audit.js";
import { pruneDeployments } from "./deployments-prune.js";
import type { LoginLimiter } from "./login-limiter.js";

export const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly
const DAY_MS = 24 * 60 * 60 * 1000;

type Logger = { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

export type PruneDeps = {
  db: DatabaseSync;
  limiter: LoginLimiter;
  retentionDays: number;
  log: Logger;
  now?: () => number;
};

export type PruneResult = { audit: number; logins: number; deployments: number };

/**
 * Delete audit rows and finished deploys past retention (deploys are also capped per
 * app) and expired login windows. Never throws.
 */
export function pruneOnce(deps: PruneDeps): PruneResult {
  const now = (deps.now ?? Date.now)();
  try {
    const cutoff = now - deps.retentionDays * DAY_MS;
    const audit = pruneAudit(deps.db, cutoff);
    const deployments = pruneDeployments(deps.db, { before: cutoff });
    const logins = deps.limiter.prune(now);
    if (audit > 0 || logins > 0 || deployments > 0) deps.log.info({ audit, logins, deployments }, "pruned database rows");
    return { audit, logins, deployments };
  } catch (err) {
    deps.log.error({ err }, "database prune failed");
    return { audit: 0, logins: 0, deployments: 0 };
  }
}

/**
 * Prune now, then every hour. The timer is unref'd so it never keeps the process
 * alive. Returns a stop function (called from the app's onClose hook).
 */
export function startPruning(deps: PruneDeps, intervalMs: number = PRUNE_INTERVAL_MS): () => void {
  pruneOnce(deps);
  const timer = setInterval(() => pruneOnce(deps), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
