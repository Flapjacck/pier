import type { FastifyPluginAsync } from "fastify";
import { listApps } from "../../k8s/apps.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { appSchema, errorSchema } from "../apps-schemas.js";

type GetAppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

/** GET /apps — list Pier-managed apps. */
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
          return await listApps(deps.k8s.clients.apps, deps.namespace);
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
