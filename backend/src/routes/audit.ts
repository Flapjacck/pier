import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { listAudit } from "../db/audit.js";
import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";
import { errorSchema } from "./apps-schemas.js";

type AuditRouteDeps = { db: DatabaseSync };

type AuditQuery = { limit: number; before?: number; app?: string };

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;

const entrySchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    ts: { type: "string", description: "ISO 8601 time of the request" },
    actor: { type: "string", enum: ["token", "session"] },
    ip: { type: "string" },
    action: { type: "string" },
    app: { type: ["string", "null"] },
    target: { type: ["string", "null"] },
    status: { type: "integer" },
    details: { type: "object", additionalProperties: true },
  },
  required: ["id", "ts", "actor", "ip", "action", "app", "target", "status", "details"],
} as const;

/** GET /audit — newest first; pass nextBefore back as ?before= for the next page. */
export function auditRoutesWithDeps(deps: AuditRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Querystring: AuditQuery }>(
      "/audit",
      {
        schema: {
          querystring: {
            type: "object",
            properties: {
              limit: { type: "integer", minimum: 1, maximum: AUDIT_MAX_LIMIT, default: AUDIT_DEFAULT_LIMIT },
              before: { type: "integer", minimum: 1 },
              app: { type: "string", pattern: APP_NAME_SCHEMA_PATTERN },
            },
            additionalProperties: false,
          },
          response: {
            200: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                entries: { type: "array", items: entrySchema },
                nextBefore: { type: ["integer", "null"] },
              },
              required: ["ok", "entries", "nextBefore"],
            },
            400: errorSchema,
            500: errorSchema,
          },
        },
      },
      async (req, reply) => {
        try {
          const page = listAudit(deps.db, req.query);
          return {
            ok: true,
            entries: page.entries.map((e) => ({ ...e, ts: new Date(e.ts).toISOString() })),
            nextBefore: page.nextBefore,
          };
        } catch (err) {
          req.log.error({ err: err instanceof Error ? err.message : String(err) }, "audit read failed");
          return reply.status(500).send({ ok: false, error: "audit log unavailable" });
        }
      },
    );
  };
}
