import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { mergeSourceApps } from "./source-app.js";
import { listApps } from "../../k8s/apps.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { appSchema, errorSchema } from "../apps-schemas.js";

type GetAppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  /** Adds git sources and source-only apps (#83). */
  db?: DatabaseSync;
};

/** GET /apps — list Pier-managed apps, including ones still on their first build (#83). */
export function getAppsRoutesWithDeps(deps: GetAppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/apps",
      {
        schema: {
          response: {
            200: {
              type: "array",
              items: appSchema,
            },
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) {
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }

        try {
          const live = await listApps(
            {
              apps: deps.k8s.clients.apps,
              networking: deps.k8s.clients.networking,
            },
            deps.namespace,
          );
          return mergeSourceApps(deps.db, live);
        } catch (err) {
          req.log.error({ err }, "list apps failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
