import type { FastifyPluginAsync } from "fastify";
import { getLiveApp } from "../../k8s/app-lookup.js";
import { listAppEvents } from "../../k8s/app-events.js";
import { isValidAppName } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";

type EventsRouteDeps = { k8s: K8sClientsResult; namespace: string };

const eventSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["Normal", "Warning"] },
    reason: { type: "string" },
    message: { type: "string" },
    summary: { type: "string" },
    object: {
      type: "object",
      properties: { kind: { type: "string" }, name: { type: "string" } },
      required: ["kind", "name"],
    },
    count: { type: "integer" },
    firstSeen: { type: "string" },
    lastSeen: { type: "string" },
  },
  required: ["type", "reason", "message", "object", "count"],
} as const;

export function getAppEventsRoutesWithDeps(deps: EventsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{
      Params: { name: string };
      Querystring: { limit: number };
    }>(
      "/apps/:name/events",
      {
        schema: {
          querystring: {
            type: "object",
            properties: { limit: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
            additionalProperties: false,
          },
          response: {
            200: { type: "object", properties: { events: { type: "array", items: eventSchema } }, required: ["events"] },
            400: errorSchema,
            404: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!isValidAppName(req.params.name)) {
          return reply.status(400).send({ ok: false, error: "invalid request" });
        }
        if (!deps.k8s.ok) {
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }
        try {
          const deployment = await getLiveApp(deps.k8s.clients.apps, deps.namespace, req.params.name);
          if (!deployment) return reply.status(404).send({ ok: false, error: "app not found" });
          const events = await listAppEvents(
            deps.k8s.clients.core,
            deps.k8s.clients.apps,
            deps.namespace,
            deployment,
            req.query.limit,
          );
          return reply.status(200).send({ events });
        } catch (err) {
          req.log.error({ err }, "list app events failed");
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }
      },
    );
  };
}
