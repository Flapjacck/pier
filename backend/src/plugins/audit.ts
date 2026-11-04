import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { insertAudit } from "../db/audit.js";
import { AUDITED_ROUTES, UNAUDITED_ROUTES } from "./audit-routes.js";

type AuditDeps = { db: DatabaseSync; now?: () => number };

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Throw at startup if a mutating route is added without an audit rule (or an explicit skip). */
function checkCovered(method: string | string[], url: string): void {
  for (const m of Array.isArray(method) ? method : [method]) {
    const key = `${m} ${url}`;
    if (MUTATING.has(m) && !(key in AUDITED_ROUTES) && !UNAUDITED_ROUTES.has(key)) {
      throw new Error(`mutating route ${key} has no audit rule; add it to AUDITED_ROUTES`);
    }
  }
}

/**
 * Record one audit row for each successful (2xx) mutating request. Runs on response, so
 * it never changes what the client gets; a failed write is logged and otherwise ignored.
 * Must be called before routes are registered so the coverage check sees every route.
 */
export function setupAudit(app: FastifyInstance, deps: AuditDeps): void {
  const now = deps.now ?? Date.now;
  app.addHook("onRoute", (route) => checkCovered(route.method, route.url));
  app.addHook("onResponse", async (req, reply) => {
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;
    const rule = AUDITED_ROUTES[`${req.method} ${req.routeOptions.url ?? ""}`];
    if (!rule) return;
    try {
      insertAudit(deps.db, {
        ts: now(),
        // Login and cookie requests carry no Authorization header; API clients send a Bearer token.
        actor: req.headers.authorization ? "token" : "session",
        ip: req.ip ?? "unknown",
        action: rule.action,
        app: rule.app(req),
        target: rule.target?.(req) ?? null,
        status: reply.statusCode,
        details: rule.details?.(req) ?? {},
      });
    } catch (err) {
      req.log.error({ err: err instanceof Error ? err.message : String(err), action: rule.action }, "audit write failed");
    }
  });
}
