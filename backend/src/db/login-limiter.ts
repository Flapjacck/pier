import type { DatabaseSync } from "node:sqlite";

/** Failed logins allowed per IP inside one window before POST /api/login answers 429. */
export const LOGIN_MAX_FAILURES = 5;
/** The window starts at the first failure and lasts this long. */
export const LOGIN_WINDOW_MS = 60_000;

export type LoginLimiter = {
  /** True once an IP has LOGIN_MAX_FAILURES failures in its current window. */
  isLimited(ip: string, now: number): boolean;
  /** Count a failure; starts a new window when the old one has passed. */
  recordFailure(ip: string, now: number): void;
  /** Forget an IP (successful login). */
  clear(ip: string): void;
  /** Delete windows that ended before `now`. Returns how many rows were removed. */
  prune(now: number): number;
};

/**
 * Login rate limiter stored in the login_attempts table, so it survives a pod
 * restart. Same rules as the old in-memory Map: 5 failures per IP within 60s of
 * the first one, then 429 until the window ends; a successful login clears it.
 */
export class SqliteLoginLimiter implements LoginLimiter {
  constructor(private readonly db: DatabaseSync) {}

  isLimited(ip: string, now: number): boolean {
    const row = this.db.prepare("SELECT count, reset_at FROM login_attempts WHERE ip = ?").get(ip);
    if (!row || now > Number(row.reset_at)) return false;
    return Number(row.count) >= LOGIN_MAX_FAILURES;
  }

  recordFailure(ip: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO login_attempts (ip, count, reset_at) VALUES (?1, 1, ?2 + ?3)
         ON CONFLICT (ip) DO UPDATE SET
           count = CASE WHEN ?2 > reset_at THEN 1 ELSE count + 1 END,
           reset_at = CASE WHEN ?2 > reset_at THEN ?2 + ?3 ELSE reset_at END`,
      )
      .run(ip, now, LOGIN_WINDOW_MS);
  }

  clear(ip: string): void {
    this.db.prepare("DELETE FROM login_attempts WHERE ip = ?").run(ip);
  }

  prune(now: number): number {
    return Number(this.db.prepare("DELETE FROM login_attempts WHERE reset_at < ?").run(now).changes);
  }
}
